class GS1DigitalLink {
  /**
   * @param {string|Array} dictionary
   *   Contenu de gs1-syntax-dictionary.txt ou dictionnaire déjà parsé.
   */
  constructor(dictionary) {
    if (typeof dictionary === "string") {
      this.dictionary = this.parseDictionary(dictionary);
    } else if (Array.isArray(dictionary)) {
      this.dictionary = dictionary;
    } else {
      throw new TypeError(
        "GS1DigitalLink: dictionary must be a string or an array."
      );
    }
  }

  // -------------------------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------------------------

  /**
   * Parse une GS1 Digital Link URI.
   *
   * @param {string|URL} input
   * @returns {Object}
   */
  parse(input) {
    const url = input instanceof URL
      ? input
      : new URL(input);

    const result = {
      url: url.href,
      scheme: url.protocol.replace(/:$/, ""),
      hostname: url.hostname,
      port: url.port || null,

      primaryKey: null,
      qualifiers: [],
      dataAttributes: [],
      extensions: [],

      fragment: url.hash
        ? decodeURIComponent(url.hash.substring(1))
        : null,

      isReferenceURI:
        url.protocol.toLowerCase() === "https:" &&
        url.hostname.toLowerCase() === "id.gs1.org",

      isCanonical: false
    };

    const path = this.parsePath(url.pathname);

    result.primaryKey = path.primaryKey;
    result.qualifiers = path.qualifiers;

    const query = this.parseQuery(url.search);

    result.dataAttributes = query.dataAttributes;
    result.extensions = query.extensions;

    result.isCanonical = this.isCanonical(result);

    return result;
  }

  /**
   * Construit une GS1 Digital Link URI.
   *
   * @param {Object} options
   * @returns {string}
   */
  build(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("build() expects an object.");
    }

    const {
      base = "https://id.gs1.org",
      primaryKey,
      qualifiers = [],
      dataAttributes = [],
      extensions = [],
      fragment = null,
      canonical = false
    } = options;

    if (!primaryKey) {
      throw new GS1DigitalLinkError(
        "primaryKey is required."
      );
    }

    const primaryAI = this.normalizeAI(primaryKey.ai);
    const primaryValue = String(primaryKey.value);

    this.assertPrimaryKey(primaryAI);
    this.validateAIValue(primaryAI, primaryValue);

    /*
     * -----------------------------------------------------------------------
     * Path
     * -----------------------------------------------------------------------
     */

    const path = [
      this.encodePathSegment(primaryAI),
      this.encodePathSegment(primaryValue)
    ];

    const normalizedQualifiers = [];

    for (const qualifier of qualifiers) {
      const ai = this.normalizeAI(qualifier.ai);
      const value = String(qualifier.value);

      this.assertQualifier(ai);
      this.validateAIValue(ai, value);

      normalizedQualifiers.push({
        ai,
        value
      });

      path.push(
        this.encodePathSegment(ai),
        this.encodePathSegment(value)
      );
    }

    this.validateQualifierOrder(
      primaryAI,
      normalizedQualifiers
    );

    /*
     * -----------------------------------------------------------------------
     * Query
     * -----------------------------------------------------------------------
     */

    const params = [];

    for (const attribute of dataAttributes) {
      const ai = this.normalizeAI(attribute.ai);
      const value = String(attribute.value);

      this.assertDataAttribute(ai);
      this.validateAIValue(ai, value);

      params.push({
        key: ai,
        value
      });
    }

    for (const extension of extensions) {
      const key = String(extension.key);
      const value = String(extension.value ?? "");

      this.assertExtensionKey(key);

      params.push({
        key,
        value
      });
    }

    if (canonical) {
      for (const parameter of params) {
        if (!this.isNumericAI(parameter.key)) {
          throw new GS1DigitalLinkError(
            `Canonical GS1 Digital Link cannot contain extension parameter "${parameter.key}".`
          );
        }
      }

      params.sort((a, b) =>
        a.key.localeCompare(b.key)
      );
    }

    /*
     * -----------------------------------------------------------------------
     * Base URL
     * -----------------------------------------------------------------------
     */

    let origin = String(base).replace(/\/+$/, "");

    if (canonical) {
      origin = "https://id.gs1.org";
    }

    let result =
      origin +
      "/" +
      path.join("/");

    /*
     * -----------------------------------------------------------------------
     * Query
     * -----------------------------------------------------------------------
     */

    if (params.length > 0) {
      result += "?";

      result += params
        .map(({ key, value }) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        )
        .join("&");
    }

    /*
     * -----------------------------------------------------------------------
     * Fragment
     * -----------------------------------------------------------------------
     */

    if (fragment !== null && fragment !== undefined) {
      result += "#" + encodeURIComponent(String(fragment));
    }

    return result;
  }

  /**
   * Vérifie si une URI est syntaxiquement une GS1 Digital Link.
   *
   * @param {string|URL} input
   * @returns {boolean}
   */
  isValid(input) {
    try {
      this.parse(input);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Récupère les informations d'un AI.
   *
   * @param {string|number} ai
   * @returns {Object|null}
   */
  getAI(ai) {
    const normalizedAI = this.normalizeAI(ai);

    const entry = this.findAI(normalizedAI);

    if (!entry) {
      return null;
    }

    return {
      ...entry,
      components: this.parseSpecification(
        entry.specification
      )
    };
  }

  /**
   * Charge le dictionnaire GS1 depuis une URL.
   *
   * @param {string} url
   * @returns {Promise<GS1DigitalLink>}
   */
  static async fromURL(url) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new GS1DigitalLinkError(
        `Unable to load GS1 dictionary: HTTP ${response.status}`
      );
    }

    const dictionary = await response.text();

    return new GS1DigitalLink(dictionary);
  }

  // -------------------------------------------------------------------------
  // DICTIONARY
  // -------------------------------------------------------------------------

  parseDictionary(text) {
    const entries = [];

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line) continue;
      if (line.startsWith("#")) continue;
      if (line.startsWith("AI ")) continue;

      const hashIndex = line.indexOf("#");

      const definition =
        hashIndex === -1
          ? line
          : line.substring(0, hashIndex).trim();

      const title =
        hashIndex === -1
          ? ""
          : line.substring(hashIndex + 1).trim();

      const columns = definition.split(/\s+/);

      if (columns.length < 2) {
        continue;
      }

      const expression = columns[0];

      const range = this.parseAIRange(expression);

      /*
       * Le dictionnaire GS1 utilise des colonnes de définition.
       * On conserve les informations brutes afin de ne pas perdre
       * d'information lors d'une évolution du dictionnaire.
       */

      let index = 1;

      let flags = "";

      /*
       * Certains flags sont représentés sous forme d'un token
       * immédiatement après l'AI.
       */
      if (
        columns[index] &&
        /^[*!?"$%&'()+,\-./:;<=>@[\\\]^_`{|}~]+$/.test(
          columns[index]
        )
      ) {
        flags = columns[index];
        index++;
      }

      const specification = [];

      while (
        index < columns.length &&
        !/^(req|ex|dlpkey)(?:=|$)/.test(columns[index])
      ) {
        specification.push(columns[index]);
        index++;
      }

      const attributes = {};

      while (index < columns.length) {
        const token = columns[index++];

        const equal = token.indexOf("=");

        if (equal === -1) {
          attributes[token] = true;
          continue;
        }

        const key = token.substring(0, equal);
        const value = token.substring(equal + 1);

        attributes[key] = value;
      }

      entries.push({
        expression,
        minAI: range.min,
        maxAI: range.max,
        flags,
        specification,
        attributes,
        title
      });
    }

    return entries.sort(
      (a, b) => a.minAI - b.minAI
    );
  }

  parseAIRange(expression) {
    if (/^\d+$/.test(expression)) {
      const value = Number(expression);

      return {
        min: value,
        max: value
      };
    }

    const match = expression.match(
      /^(\d+)-(\d+)$/
    );

    if (!match) {
      throw new GS1DigitalLinkError(
        `Invalid AI expression: ${expression}`
      );
    }

    return {
      min: Number(match[1]),
      max: Number(match[2])
    };
  }

  findAI(ai) {
    const numericAI = Number(ai);

    return this.dictionary.find(entry =>
      entry.minAI <= numericAI &&
      numericAI <= entry.maxAI
    ) ?? null;
  }

  // -------------------------------------------------------------------------
  // PATH
  // -------------------------------------------------------------------------

  parsePath(pathname) {
    const segments = pathname
      .split("/")
      .filter(Boolean)
      .map(segment => decodeURIComponent(segment));

    if (segments.length < 2) {
      throw new GS1DigitalLinkError(
        "A GS1 Digital Link requires a primary AI and value."
      );
    }

    const primaryAI = this.normalizeAI(
      segments[0]
    );

    const primaryValue = segments[1];

    this.assertPrimaryKey(primaryAI);
    this.validateAIValue(
      primaryAI,
      primaryValue
    );

    const primaryKey = {
      ai: primaryAI,
      value: primaryValue,
      definition: this.getAI(primaryAI)
    };

    const qualifiers = [];

    /*
     * Les qualifiers sont toujours AI/value.
     */
    for (let i = 2; i < segments.length; i += 2) {
      if (segments[i + 1] === undefined) {
        throw new GS1DigitalLinkError(
          "Qualifier AI is missing its value."
        );
      }

      const ai = this.normalizeAI(
        segments[i]
      );

      const value = segments[i + 1];

      this.assertQualifier(ai);
      this.validateAIValue(ai, value);

      qualifiers.push({
        ai,
        value,
        definition: this.getAI(ai)
      });
    }

    this.validateQualifierOrder(
      primaryAI,
      qualifiers
    );

    return {
      primaryKey,
      qualifiers
    };
  }

  // -------------------------------------------------------------------------
  // QUERY
  // -------------------------------------------------------------------------

  parseQuery(search) {
    const dataAttributes = [];
    const extensions = [];

    if (!search) {
      return {
        dataAttributes,
        extensions
      };
    }

    /*
     * La spécification GS1 autorise & et ;.
     *
     * URLSearchParams ne traite pas ';' comme séparateur.
     * On normalise donc uniquement les séparateurs de query.
     */
    const raw = search.startsWith("?")
      ? search.substring(1)
      : search;

    const query = raw.replace(/;/g, "&");

    const params = new URLSearchParams(query);

    /*
     * La spécification indique qu'un même paramètre
     * ne doit pas être répété avec la même primary identification key.
     */
    const seenNumeric = new Set();

    for (const [key, value] of params.entries()) {
      if (this.isNumericAI(key)) {
        const ai = this.normalizeAI(key);

        if (seenNumeric.has(ai)) {
          throw new GS1DigitalLinkError(
            `GS1 AI "${ai}" appears more than once in the query string.`
          );
        }

        seenNumeric.add(ai);

        this.assertDataAttribute(ai);
        this.validateAIValue(ai, value);

        dataAttributes.push({
          ai,
          value,
          definition: this.getAI(ai)
        });

        continue;
      }

      this.assertExtensionKey(key);

      extensions.push({
        key,
        value
      });
    }

    return {
      dataAttributes,
      extensions
    };
  }

  // -------------------------------------------------------------------------
  // VALIDATION
  // -------------------------------------------------------------------------

  assertPrimaryKey(ai) {
    const definition = this.findAI(ai);

    if (!definition) {
      throw new GS1DigitalLinkError(
        `Unknown GS1 AI: ${ai}`
      );
    }

    if (!this.isPrimaryKey(ai)) {
      throw new GS1DigitalLinkError(
        `AI ${ai} is not a GS1 Digital Link primary identification key.`
      );
    }
  }

  assertQualifier(ai) {
    const definition = this.findAI(ai);

    if (!definition) {
      throw new GS1DigitalLinkError(
        `Unknown GS1 AI: ${ai}`
      );
    }

    if (!this.isQualifier(ai)) {
      throw new GS1DigitalLinkError(
        `AI ${ai} is not a GS1 Digital Link key qualifier.`
      );
    }
  }

  assertDataAttribute(ai) {
    const definition = this.findAI(ai);

    if (!definition) {
      throw new GS1DigitalLinkError(
        `Unknown GS1 AI: ${ai}`
      );
    }

    /*
     * '?' indique qu'un AI peut être représenté comme
     * data attribute dans le Digital Link.
     */
    if (!definition.flags.includes("?")) {
      throw new GS1DigitalLinkError(
        `AI ${ai} is not permitted as a Digital Link data attribute.`
      );
    }
  }

  assertExtensionKey(key) {
    /*
     * Les extension keys ne doivent pas être entièrement numériques.
     */
    if (/^\d+$/.test(key)) {
      throw new GS1DigitalLinkError(
        `Extension key "${key}" cannot be numeric.`
      );
    }

    /*
     * Reserved keywords.
     *
     * Ils sont valides dans le Digital Link ecosystem,
     * mais leur sémantique est définie par le Resolver Standard.
     */
    if (
      key === "linkType" ||
      key === "context"
    ) {
      return;
    }

    /*
     * Correspond au caractère d'extension autorisé
     * par la syntaxe URI.
     */
    if (
      !/^[A-Za-z_][A-Za-z0-9._~:+/@!$'()*,-]*$/.test(key)
    ) {
      throw new GS1DigitalLinkError(
        `Invalid extension parameter key: ${key}`
      );
    }
  }

  isPrimaryKey(ai) {
    /*
     * Liste normative des primary identification keys
     * du GS1 Digital Link URI Syntax.
     */
    return [
      "01",
      "8006",
      "8013",
      "8010",
      "414",
      "415",
      "417",
      "8017",
      "8018",
      "255",
      "00",
      "253",
      "401",
      "402",
      "8003",
      "8004"
    ].includes(ai);
  }

  isQualifier(ai) {
    return [
      "22",
      "10",
      "21",
      "8011",
      "254",
      "8020",
      "8019",
      "235",
      "7040"
    ].includes(ai);
  }

  /**
   * Vérifie la séquence des qualifiers.
   *
   * La spécification GS1 impose un ordre déterminé.
   */
  validateQualifierOrder(primaryAI, qualifiers) {
    const order = {
      "01": [
        "22",
        "10",
        "21"
      ],

      "8006": [
        "22",
        "10",
        "21"
      ],

      "8010": [
        "8011"
      ],

      "414": [
        "254"
      ],

      "415": [
        "254"
      ],

      "417": [
        "254"
      ],

      "8017": [
        "8019"
      ],

      "8018": [
        "8019"
      ],

      "255": [],
      "00": [],
      "253": [],
      "401": [],
      "402": [],
      "8003": [],
      "8004": []
    };

    const allowed = order[primaryAI] ?? [];

    const actual = qualifiers.map(
      qualifier => qualifier.ai
    );

    /*
     * Les qualifiers doivent être préfixés par la séquence
     * autorisée pour la primary key.
     */
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== allowed[i]) {
        throw new GS1DigitalLinkError(
          `Invalid qualifier order for primary AI ${primaryAI}. ` +
          `Expected ${allowed[i] ?? "no additional qualifier"}, ` +
          `got ${actual[i]}.`
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // AI VALUE VALIDATION
  // -------------------------------------------------------------------------

  validateAIValue(ai, value) {
    const definition = this.findAI(ai);

    if (!definition) {
      throw new GS1DigitalLinkError(
        `Unknown GS1 AI: ${ai}`
      );
    }

    const components =
      this.parseSpecification(
        definition.specification
      );

    if (components.length === 0) {
      return true;
    }

    let offset = 0;

    for (let i = 0; i < components.length; i++) {
      const component = components[i];

      if (offset >= value.length) {
        if (component.optional) {
          continue;
        }

        throw new GS1DigitalLinkError(
          `AI ${ai}: missing mandatory component.`
        );
      }

      let length;

      if (component.fixed) {
        length = component.max;
      } else {
        /*
         * Une composante variable est normalement la dernière
         * composante de l'AI dans le dictionnaire.
         */
        if (i !== components.length - 1) {
          throw new GS1DigitalLinkError(
            `AI ${ai}: variable-length component must be final.`
          );
        }

        length = value.length - offset;
      }

      const part = value.substring(
        offset,
        offset + length
      );

      this.validateComponent(
        ai,
        part,
        component
      );

      offset += length;
    }

    if (offset !== value.length) {
      throw new GS1DigitalLinkError(
        `AI ${ai}: unexpected trailing data.`
      );
    }

    /*
     * Checksum GS1 Modulo 10.
     */
    if (
      components.some(component =>
        component.linters.includes("csum")
      )
    ) {
      this.validateCheckDigit(
        ai,
        value
      );
    }

    return true;
  }

  parseSpecification(specification) {
    return specification.map(token => {
      let optional = false;

      let value = token;

      if (
        value.startsWith("[") &&
        value.endsWith("]")
      ) {
        optional = true;
        value = value.substring(
          1,
          value.length - 1
        );
      }

      const [typeAndLength, ...linters] =
        value.split(",");

      const type =
        typeAndLength.substring(0, 1);

      const length =
        typeAndLength.substring(1);

      let min;
      let max;
      let fixed = false;

      if (/^\d+$/.test(length)) {
        min = Number(length);
        max = Number(length);
        fixed = true;
      } else {
        const range =
          length.match(/^\.\.(\d+)$/);

        if (!range) {
          throw new GS1DigitalLinkError(
            `Unsupported component specification: ${token}`
          );
        }

        min = 1;
        max = Number(range[1]);
      }

      return {
        optional,
        type,
        min,
        max,
        fixed,
        linters
      };
    });
  }

  validateComponent(ai, value, component) {
    if (
      value.length < component.min ||
      value.length > component.max
    ) {
      throw new GS1DigitalLinkError(
        `AI ${ai}: invalid length.`
      );
    }

    let pattern;

    switch (component.type) {
      case "N":
        pattern = /^[0-9]+$/;
        break;

      case "X":
        /*
         * X = GS1 AI character set / CSET 82.
         *
         * On garde ici les caractères ASCII imprimables ;
         * les restrictions URI sont ensuite traitées par
         * encodeURIComponent().
         */
        pattern = /^[\x21-\x7E]+$/;
        break;

      case "Y":
        pattern = /^[A-Z0-9\-./ ]+$/;
        break;

      case "Z":
        pattern = /^[A-Za-z0-9_-]+$/;
        break;

      default:
        throw new GS1DigitalLinkError(
          `Unsupported GS1 component type: ${component.type}`
        );
    }

    if (!pattern.test(value)) {
      throw new GS1DigitalLinkError(
        `AI ${ai}: invalid characters for type ${component.type}.`
      );
    }

    for (const linter of component.linters) {
      this.runLinter(
        linter,
        ai,
        value
      );
    }
  }

  runLinter(linter, ai, value) {
    switch (linter) {
      case "csum":
        return;

      case "nonzero":
        if (/^0+$/.test(value)) {
          throw new GS1DigitalLinkError(
            `AI ${ai}: value must not be zero.`
          );
        }
        return;

      case "zero":
        if (!/^0+$/.test(value)) {
          throw new GS1DigitalLinkError(
            `AI ${ai}: value must be zero.`
          );
        }
        return;

      case "nozeroprefix":
        if (
          value.length > 1 &&
          value.startsWith("0")
        ) {
          throw new GS1DigitalLinkError(
            `AI ${ai}: leading zero is not permitted.`
          );
        }
        return;

      /*
       * Les linters spécialisés du dictionnaire GS1
       * peuvent être ajoutés ici :
       *
       * cset39
       * cset64
       * cset82
       * iso4217
       * iso3166
       * iban
       * gcppos1
       * gcppos2
       * etc.
       *
       * On ne les ignore pas silencieusement dans une future
       * version : ils peuvent être branchés via registerLinter().
       */
      default:
        return;
    }
  }

  validateCheckDigit(ai, value) {
    if (!/^\d+$/.test(value)) {
      throw new GS1DigitalLinkError(
        `AI ${ai}: check digit requires numeric data.`
      );
    }

    const body = value.substring(
      0,
      value.length - 1
    );

    const expected =
      this.calculateMod10(body);

    const actual =
      Number(value[value.length - 1]);

    if (expected !== actual) {
      throw new GS1DigitalLinkError(
        `AI ${ai}: invalid check digit. ` +
        `Expected ${expected}, got ${actual}.`
      );
    }
  }

  calculateMod10(value) {
    let sum = 0;
    let weight = 3;

    for (
      let i = value.length - 1;
      i >= 0;
      i--
    ) {
      sum +=
        Number(value[i]) *
        weight;

      weight =
        weight === 3
          ? 1
          : 3;
    }

    return (
      10 - (sum % 10)
    ) % 10;
  }

  // -------------------------------------------------------------------------
  // CANONICAL URI
  // -------------------------------------------------------------------------

  isCanonical(parsed) {
    if (
      parsed.scheme.toLowerCase() !== "https" ||
      parsed.hostname.toLowerCase() !== "id.gs1.org"
    ) {
      return false;
    }

    /*
     * Pas de paramètres d'extension.
     */
    if (parsed.extensions.length > 0) {
      return false;
    }

    /*
     * Les paramètres GS1 doivent être triés lexicalement.
     */
    const keys =
      parsed.dataAttributes.map(
        attribute => attribute.ai
      );

    const sorted = [...keys].sort(
      (a, b) => a.localeCompare(b)
    );

    return keys.every(
      (value, index) =>
        value === sorted[index]
    );
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  normalizeAI(ai) {
    const value = String(ai);

    if (!/^\d{2,4}$/.test(value)) {
      throw new GS1DigitalLinkError(
        `Invalid GS1 Application Identifier: ${value}`
      );
    }

    return value;
  }

  isNumericAI(value) {
    return /^\d+$/.test(String(value));
  }

  encodePathSegment(value) {
    return encodeURIComponent(
      String(value)
    );
  }
}


class GS1DigitalLinkError extends Error {
  constructor(message) {
    super(message);

    this.name = "GS1DigitalLinkError";
  }
}