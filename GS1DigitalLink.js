/**
 * @class GS1DigitalLinkError all Gs1 errors will throw GS1DigitalLinkError
 * @class GS1DigitalLink the main class of this module
 * @method GS1DigitalLink.fromUrl (initialize using definition from URL)
 * @method GS1DigitalLink.fromGithubLastTag (initialize using definition from public Github repo)
 */
/**
 * @fileoverview GS1DigitalLink - Validate, parse and build GS1 URL.
 * @author Joel Duret 
 * @license MIT
 * @method GS1DigitalLink.fromUrl (initialize using definition from URL)
 * @method GS1DigitalLink.fromGithubLastTag (initialize using definition from public Github repo)
 *
 * Copyright (c) 2026 Joel Duret [jodev4u@gmail.com]
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
class GS1DigitalLinkError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "GS1DigitalLinkError";
    Object.assign(this, details);
  }
}

class GS1DigitalLink {
  /**
   * @param {string} dictionaryText
   * @param {object} options
   * @param {string|null} options.dictionaryUrl
   */
  constructor(dictionaryText, options = {}) {
    if (typeof dictionaryText !== "string") {
      throw new TypeError(
        "GS1DigitalLink requires the GS1 Syntax Dictionary as a string."
      );
    }

    this.dictionaryUrl = options.dictionaryUrl ?? null;

    /*
     * Le dictionnaire est parsé une seule fois par instance.
     * Pour le cache global, utiliser GS1DigitalLink.fromURL().
     */
    this.dictionary = this.#parseDictionary(dictionaryText);

    if (0 === this.dictionary.length) {
      throw new GS1DigitalLinkError(
        `Unable to load GS1 Syntax Dictionary`,
        {
          dictionaryText: dictionaryText
        }
      );
    }
    /*
     * Index exact des AI.
     */
    this.aiIndex = new Map();

    /*
     * Index des plages.
     */
    this.aiRanges = [];

    for (const entry of this.dictionary) {
      if (entry.minAI === entry.maxAI) {
        this.aiIndex.set(
          String(entry.minAI).padStart(2, "0"),
          entry
        );
      } else {
        this.aiRanges.push(entry);
      }
    }

    /*
     * Cache des résultats de parsing des Digital Links.
     *
     * key   = URL.href
     * value = résultat du parse
     */
    this.urlCache = new Map();
  }


  // ===========================================================================
  // FACTORY
  // ===========================================================================

  /**
   * Charge un dictionnaire GS1 depuis une URL.
   *
   * Le dictionnaire est mis en cache par son URL.
   *
   * @param {string} dictionaryUrl
   * @returns {GS1DigitalLink}
   */
  static async fromURL(dictionaryUrl) {

    const cacheKey = `GS1DigitalLink+${dictionaryUrl}`;
    let cacheDictionary = sessionStorage.getItem(cacheKey);
    if (null !== cacheDictionary) {
      console.log("GS1DigitalLink dictionary from cache");
      try {
        return new GS1DigitalLink(window.atob(cacheDictionary), {
          "dictionaryUrl": dictionaryUrl
        });
      } catch (cacheError) {
        console.error(cacheError);
        sessionStorage.removeItem(cacheKey);
      }
    }

    console.log("Parse GS1DigitalLink Dictionary");
    const response = await fetch(dictionaryUrl);

    if (!response.ok) {
      throw new GS1DigitalLinkError(
        `Unable to load GS1 Syntax Dictionary: HTTP ${response.status}`,
        {
          url: dictionaryUrl,
          status: response.status
        }
      );
    }

    const text = await response.text();

    var self = new GS1DigitalLink(text, {
      "dictionaryUrl": dictionaryUrl
    });

    sessionStorage.setItem(
      cacheKey,
      window.btoa(text)
    );

    return self;
  }

  static async fromGithubLastTag(owner, repo, filePath) {
    const cacheKey = `GS1DigitalLink+${owner}+${repo}+${filePath}`;
    let cacheRawUrl = sessionStorage.getItem(cacheKey);
    if (null !== cacheRawUrl) {
      console.log("GS1DigitalLink Github URL from cache");
      return GS1DigitalLink.fromURL(cacheRawUrl);
    }

    // 1. Récupérer les tags via l'API GitHub
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/tags`);

    if (!response.ok) {
      throw new Error(`Erreur API GitHub: ${response.status} ${response.statusText}`);
    }

    const tags = await response.json();

    // Vérifier qu'il y a au moins un tag
    if (!tags || tags.length === 0) {
      throw new GS1DigitalLinkError("Aucun tag trouvé sur ce dépôt.");
    }

    // Le dernier tag est le premier dans la liste (GitHub retourne par ordre décroissant)
    const lastTag = tags[0].name;
    console.log(`Dernier tag : ${lastTag}`);

    // 2. Construire l'URL du fichier raw
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${lastTag}/${filePath}`;
    
    console.log("GS1DigitalLink Github URL generated with last tag");
    sessionStorage.setItem(cacheKey, rawUrl);
    return GS1DigitalLink.fromURL(rawUrl);
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Parse une GS1 Digital Link.
   *
   * Si exactement la même URL a déjà été parsée, le résultat en cache
   * est retourné immédiatement.
   *
   * @param {string|URL} input
   * @param {object} options
   * @param {boolean} options.clone
   *
   * @returns {object}
   */
  parse(input, options = {}) {

    const url =
      input instanceof URL
        ? new URL(input.href)
        : new URL(String(input));

    /*
     * URL.href fournit une représentation normalisée.
     *
     * Deux représentations équivalentes de la même URL peuvent donc
     * partager le cache.
     */
    const cacheKey = url.href;

    if (this.urlCache.has(cacheKey)) {

      const cached = this.urlCache.get(cacheKey);

      /*
       * Par défaut, on retourne le même objet.
       *
       * clone=true permet d'obtenir une copie si le consommateur
       * risque de modifier le résultat.
       */
      return options.clone
        ? structuredClone(cached)
        : cached;
    }

    const result = this.#parseURL(url);

    this.urlCache.set(
      cacheKey,
      result
    );

    return options.clone
      ? structuredClone(result)
      : result;
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
   * Construit un GS1 Digital Link.
   */
  build(options) {

    if (!options || typeof options !== "object") {
      throw new TypeError(
        "build() expects an object."
      );
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


    if (
      !primaryKey ||
      primaryKey.ai === undefined ||
      primaryKey.value === undefined
    ) {
      throw new GS1DigitalLinkError(
        "primaryKey.ai and primaryKey.value are required."
      );
    }


    /*
     * -------------------------------------------------------------------------
     * Primary key
     * -------------------------------------------------------------------------
     */

    const primaryAI =
      this.normalizeAI(primaryKey.ai);

    const primaryValue =
      String(primaryKey.value);

    const primaryDefinition =
      this.getAI(primaryAI);

    if (!primaryDefinition) {
      throw new GS1DigitalLinkError(
        `Unknown GS1 Application Identifier: ${primaryAI}`
      );
    }

    /*
     * Pas de liste codée en dur :
     *
     * dlpkey est la seule source de vérité.
     */
    if (!this.isDigitalLinkPrimaryKey(primaryDefinition)) {
      throw new GS1DigitalLinkError(
        `AI ${primaryAI} is not a GS1 Digital Link primary key.`
      );
    }

    this.validateAIValue(
      primaryAI,
      primaryValue
    );


    const path = [
      this.#encodePathSegment(primaryAI),
      this.#encodePathSegment(primaryValue)
    ];


    /*
     * -------------------------------------------------------------------------
     * Qualifiers
     * -------------------------------------------------------------------------
     */

    const normalizedQualifiers = [];

    for (const qualifier of qualifiers) {

      const ai =
        this.normalizeAI(qualifier.ai);

      const value =
        String(qualifier.value);

      const definition =
        this.getAI(ai);

      if (!definition) {
        throw new GS1DigitalLinkError(
          `Unknown qualifier AI: ${ai}`
        );
      }

      /*
       * L'AI doit apparaître dans au moins une des séquences dlpkey
       * de la primary key.
       */
      normalizedQualifiers.push({
        ai,
        value,
        definition
      });
    }


    this.#validateQualifierSequence(
      primaryDefinition,
      normalizedQualifiers
    );


    for (const qualifier of normalizedQualifiers) {

      this.validateAIValue(
        qualifier.ai,
        qualifier.value
      );

      path.push(
        this.#encodePathSegment(
          qualifier.ai
        ),
        this.#encodePathSegment(
          qualifier.value
        )
      );
    }


    /*
     * -------------------------------------------------------------------------
     * Query parameters
     * -------------------------------------------------------------------------
     */

    const queryParameters = [];


    for (const attribute of dataAttributes) {

      const ai =
        this.normalizeAI(attribute.ai);

      const value =
        String(attribute.value);

      const definition =
        this.getAI(ai);

      if (!definition) {
        throw new GS1DigitalLinkError(
          `Unknown data attribute AI: ${ai}`
        );
      }

      this.#validateQueryAI(ai, value);

      this.validateAIValue(
        ai,
        value
      );

      queryParameters.push({
        key: ai,
        value
      });
    }


    /*
     * -------------------------------------------------------------------------
     * Extensions
     * -------------------------------------------------------------------------
     */

    for (const extension of extensions) {

      const key =
        String(extension.key);

      const value =
        String(extension.value ?? "");

      this.#validateExtensionKey(key);

      queryParameters.push({
        key,
        value
      });
    }


    /*
     * -------------------------------------------------------------------------
     * Canonicalisation
     * -------------------------------------------------------------------------
     */

    let origin =
      String(base).replace(/\/+$/, "");


    if (canonical) {

      origin =
        "https://id.gs1.org";

      /*
       * Une URI canonique ne contient que des GS1 data attributes.
       */
      if (
        queryParameters.some(
          parameter =>
            !this.#isNumeric(parameter.key)
        )
      ) {
        throw new GS1DigitalLinkError(
          "Canonical Digital Link cannot contain extension parameters."
        );
      }

      queryParameters.sort(
        (a, b) =>
          a.key.localeCompare(b.key)
      );
    }


    let result =
      `${origin}/${path.join("/")}`;


    if (queryParameters.length > 0) {

      result += "?";

      result += queryParameters
        .map(
          ({ key, value }) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        )
        .join("&");
    }


    if (
      fragment !== null &&
      fragment !== undefined
    ) {
      result +=
        "#" +
        encodeURIComponent(
          String(fragment)
        );
    }


    return result;
  }


  #validateQueryAI(ai, value, pathParams, dataAttributes) {
    const definition = this.getAI(ai);

    if (!definition) {
      throw new GS1DigitalLinkError(
        `Unknown GS1 Application Identifier: ${ai}`
      );
    }

    // Le flag '?' signifie que l'AI est explicitement
    // autorisé comme attribut GS1 Digital Link générique.
    if (definition.flags.includes('?')) {
      return;
    }

    // Certaines AIs sans '?' peuvent néanmoins être
    // présentes dans les données associées si leurs
    // règles d'association GS1 les rendent applicables.
    //
    // La décision ne doit donc PAS être prise ici
    // uniquement à partir du flag '?'.
    // Il faut donc ajouter la gestion du req "01+21" par exemple
    // pour valider le queryAI si les clés 01 et 21 sont bien présentes
    if (definition.attributes.req) {
      const requirements = definition.attributes.req.split('+');
      requirementsLoop:
      for (const requiredAI of requirements) {
        let reqDefinition = this.getAI(requiredAI);

        if (!reqDefinition) {
          throw new GS1DigitalLinkError(
            `Unknown GS1 Application Identifier: ${requiredAI}`
          );
        }

        // le QueryAI n'est valide que si le DigitalLink contient le primaryKey 
        if (reqDefinition.attributes.dlpkey) {
          if (pathParams.primaryKey.ai !== requiredAI) {
            throw new GS1DigitalLinkError(
              `Invalid GS1 Query identifier : ${ai} depending on PrimaryKey ${requiredAI}`
            );
          }
        } else {
          // pour chaque elements requis, recherche s'il s'agit d'un Qualifier présent dans l'URL
          for (const qualifierAIValues of pathParams.qualifiers) {
            if (qualifierAIValues.ai === requiredAI) {
              continue requirementsLoop;
            }
          }

          // pour chaque elements requis, recherche s'il s'agit d'un autre dataAttribute présent dans l'URL
          for (const dataAttributeAIValues of dataAttributes) {
            if (dataAttributeAIValues.ai === requiredAI) {
              continue requirementsLoop;
            }
          }

          throw new GS1DigitalLinkError(
            `Invalid GS1 Query identifier : ${ai} depending on Qualifier ${requiredAI}`
          );
        }
      }
    }
  }

  /**
   * Récupère la définition d'un AI.
   *
   * Les AI individuels et les plages sont recherchés.
   */
  getAI(ai) {

    const normalizedAI =
      this.normalizeAI(ai);

    /*
     * Recherche exacte.
     */
    const exact =
      this.aiIndex.get(normalizedAI);

    if (exact) {
      return exact;
    }


    /*
     * Recherche dans les plages.
     */
    const numeric =
      Number(normalizedAI);

    for (const entry of this.aiRanges) {

      if (
        numeric >= entry.minAI &&
        numeric <= entry.maxAI
      ) {
        return entry;
      }
    }

    return null;
  }


  /**
   * Retourne les AIs permettant d'être utilisés comme
   * primary identification key.
   *
   * Aucun AI n'est codé en dur ici.
   */
  getPrimaryKeys() {

    return this.dictionary
      .filter(
        entry =>
          this.isDigitalLinkPrimaryKey(entry)
      )
      .map(
        entry =>
          entry.expression
      );
  }


  /**
   * Retourne tous les AIs autorisés comme data attributes.
   */
  getDataAttributes() {

    return this.dictionary
      .filter(
        entry =>
          entry.flags.includes("?")
      )
      .map(
        entry =>
          entry.expression
      );
  }


  /**
   * Retourne la définition interne du dictionnaire.
   */
  getDictionary() {
    return this.dictionary;
  }


  /**
   * Vide uniquement le cache des URLs parsées
   * de cette instance.
   */
  clearURLCache() {
    this.urlCache.clear();
  }


  /**
   * Supprime une URL précise du cache.
   */
  invalidateURL(input) {

    const url =
      input instanceof URL
        ? new URL(input.href)
        : new URL(String(input));

    this.urlCache.delete(
      url.href
    );
  }


  /**
   * Nombre d'URLs actuellement en cache.
   */
  get cacheSize() {
    return this.urlCache.size;
  }


  // ===========================================================================
  // INTERNAL URL PARSER
  // ===========================================================================

  #parseURL(url) {

    const path =
      this.#parsePath(
        url.pathname
      );


    const query =
      this.#parseQuery(
        url.search,
        path
      );


    const result = {

      url: url.href,

      scheme:
        url.protocol.replace(/:$/, ""),

      hostname:
        url.hostname,

      port:
        url.port || null,

      pathname:
        url.pathname,

      primaryKey:
        path.primaryKey,

      qualifiers:
        path.qualifiers,

      dataAttributes:
        query.dataAttributes,

      extensions:
        query.extensions,

      fragment:
        url.hash
          ? decodeURIComponent(
            url.hash.substring(1)
          )
          : null,

      isReferenceURI:
        url.protocol.toLowerCase() === "https:" &&
        url.hostname.toLowerCase() === "id.gs1.org",

      dictionaryUrl:
        this.dictionaryUrl,

      cached: false
    };


    result.isCanonical =
      this.#isCanonical(result);


    return result;
  }


  // ===========================================================================
  // PATH
  // ===========================================================================

  #parsePath(pathname) {

    const segments =
      pathname
        .split("/")
        .filter(Boolean)
        .map(
          segment =>
            decodeURIComponent(segment)
        );


    if (segments.length < 2) {
      throw new GS1DigitalLinkError(
        "A GS1 Digital Link requires a primary AI and value."
      );
    }

    const start = this.#findGS1PathStart(segments);

    if (start === -1) {
      throw new GS1DigitalLinkError(
        `No GS1 Digital Link primary identification key found in pathname ${pathname}`
      );
    }

    //const prefixSegments = segments.slice(0, start);
    const gs1Segments = segments.slice(start);

    /*
     * -------------------------------------------------------------------------
     * Primary key
     * -------------------------------------------------------------------------
     */

    const primaryAI =
      this.normalizeAI(
        gs1Segments[0]
      );

    const primaryValue =
      gs1Segments[1];


    const primaryDefinition =
      this.getAI(primaryAI);


    if (!primaryDefinition) {
      throw new GS1DigitalLinkError(
        `Unknown GS1 Application Identifier: ${primaryAI}`
      );
    }


    /*
     * Le dictionnaire détermine si l'AI est une primary key.
     */
    if (
      !this.isDigitalLinkPrimaryKey(
        primaryDefinition
      )
    ) {
      throw new GS1DigitalLinkError(
        `AI ${primaryAI} is not a Digital Link primary key.`
      );
    }


    this.validateAIValue(
      primaryAI,
      primaryValue
    );


    const primaryKey = {
      ai: primaryAI,
      value: primaryValue,
      definition: primaryDefinition
    };


    /*
     * -------------------------------------------------------------------------
     * Qualifiers
     * -------------------------------------------------------------------------
     */

    const qualifiers = [];


    if (
      (gs1Segments.length - 2) % 2 !== 0
    ) {
      throw new GS1DigitalLinkError(
        "A qualifier AI is missing its value."
      );
    }


    for (
      let i = 2;
      i < gs1Segments.length;
      i += 2
    ) {

      const ai =
        this.normalizeAI(
          gs1Segments[i]
        );

      const value =
        gs1Segments[i + 1];


      const definition =
        this.getAI(ai);


      if (!definition) {
        throw new GS1DigitalLinkError(
          `Unknown qualifier AI: ${ai}`
        );
      }


      this.validateAIValue(
        ai,
        value
      );


      qualifiers.push({
        ai,
        value,
        definition
      });
    }


    /*
     * Vérification par rapport au dlpkey de la primary key.
     */
    this.#validateQualifierSequence(
      primaryDefinition,
      qualifiers
    );


    return {
      primaryKey,
      qualifiers
    };
  }

  #findGS1PathStart(segments) {
    for (let i = 0; i < segments.length; i++) {
      const candidateAI = segments[i];

      let definition = false;

      try {
        // Le dictionnaire est la seule source de vérité.
        definition = this.getAI(candidateAI);
      } catch (invalidAI) {
        continue;
      }

      if (!definition) {
        continue;
      }

      // On a trouvé un AI connu.
      // Vérifions qu'il peut réellement commencer
      // un GS1 Digital Link.
      if (this.isDigitalLinkPrimaryKey(definition)) {
        return i;
      }
    }

    return -1;
  }

  // ===========================================================================
  // QUERY STRING
  // ===========================================================================

  #parseQuery(search, pathParams) {

    const dataAttributes = [];
    const extensions = [];


    if (!search) {
      return {
        dataAttributes,
        extensions
      };
    }


    let raw =
      search.startsWith("?")
        ? search.substring(1)
        : search;


    /*
     * GS1 accepte & et ; comme séparateurs.
     */
    raw =
      raw.replace(/;/g, "&");


    const params =
      new URLSearchParams(raw);


    const seenNumericAIs =
      new Set();


    for (
      const [key, value]
      of params.entries()
    ) {

      /*
       * -----------------------------------------------------------------------
       * GS1 AI data attribute
       * -----------------------------------------------------------------------
       */

      if (
        this.#isNumeric(key)
      ) {

        const ai =
          this.normalizeAI(key);

        if (
          seenNumericAIs.has(ai)
        ) {
          throw new GS1DigitalLinkError(
            `AI ${ai} appears more than once in the query string.`
          );
        }


        seenNumericAIs.add(ai);


        const definition =
          this.getAI(ai);


        if (!definition) {
          throw new GS1DigitalLinkError(
            `Unknown GS1 Application Identifier: ${ai}`
          );
        }

        this.#validateQueryAI(ai, value, pathParams, dataAttributes);

        this.validateAIValue(
          ai,
          value
        );

        dataAttributes.push({
          ai,
          value,
          definition
        });

        continue;
      }

      /*
       * -----------------------------------------------------------------------
       * Extension parameter
       * -----------------------------------------------------------------------
       */
      this.#validateExtensionKey(key);

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

  // ===========================================================================
  // DICTIONARY PARSER
  // ===========================================================================

  #parseDictionary(text) {

    const entries = [];

    const lines =
      text.split(/\r?\n/);

    for (const rawLine of lines) {

      const line =
        rawLine.trim();

      if (!line) continue;
      if (line.startsWith("#")) continue;

      /*
       * Ligne de commentaire / header.
       */
      if (
        line.startsWith("AI ") ||
        line.startsWith("AIs ")
      ) {
        continue;
      }

      /*
       * -----------------------------------------------------------------------
       * Title
       * -----------------------------------------------------------------------
       */
      const hash =
        line.indexOf("#");

      const definitionPart =
        hash >= 0
          ? line.substring(0, hash).trim()
          : line;

      const title =
        hash >= 0
          ? line.substring(hash + 1).trim()
          : "";

      if (!definitionPart) {
        continue;
      }

      /*
       * -----------------------------------------------------------------------
       * Colonnes
       * -----------------------------------------------------------------------
       *
       * Syntaxe GS1 :
       *
       * AIs [Flags] Specification [Attributes...]
       *
       * Exemple :
       *
       * 01 *? N14,csum,gcppos2 ex=255,37 dlpkey=22,10,21|235
       *
       * Important :
       * req/ex peuvent contenir des virgules.
       * On ne peut donc pas simplement faire split(",").
       */
      const columns =
        definitionPart.split(/\s+/);

      if (columns.length < 2) {
        continue;
      }

      const expression =
        columns[0];

      const range =
        this.#parseAIRange(
          expression
        );

      let index = 1;

      /*
       * Flags.
       */
      let flags = "";

      if (
        columns[index] &&
        this.#isFlagsToken(
          columns[index]
        )
      ) {
        flags =
          columns[index];

        index++;
      }

      /*
       * Specification.
       *
       * Une specification commence par N/X/Y/Z.
       */
      const specification = [];

      while (
        index < columns.length &&
        !this.#isAttributeToken(
          columns[index]
        )
      ) {

        specification.push(
          columns[index]
        );

        index++;
      }

      /*
       * Attributes.
       */
      const attributes = {};

      while (
        index < columns.length
      ) {
        const token =
          columns[index++];

        const equal =
          token.indexOf("=");

        if (equal === -1) {

          /*
           * Exemple :
           *
           * dlpkey
           */
          attributes[token] = true;

          continue;
        }

        const key =
          token.substring(
            0,
            equal
          );

        const value =
          token.substring(
            equal + 1
          );


        /*
         * Le dictionnaire peut éventuellement avoir
         * plusieurs occurrences d'une même clé.
         */
        if (
          Object.hasOwn(
            attributes,
            key
          )
        ) {

          if (
            Array.isArray(
              attributes[key]
            )
          ) {
            attributes[key].push(value);
          } else {
            attributes[key] = [
              attributes[key],
              value
            ];
          }

        } else {

          attributes[key] = value;
        }
      }

      entries.push({
        expression,
        minAI:
          range.min,
        maxAI:
          range.max,
        flags,
        specification,
        components:
          this.#parseSpecification(
            specification
          ),
        attributes,
        title
      });
    }

    return entries;
  }


  #isFlagsToken(token) {

    /*
     * Les flags sont composés uniquement de caractères
     * provenant de l'alphabet de flags GS1.
     */
    return /^[*!?"$%&'()+,\-./:;<=>@\[\\\]^_`{|}~]+$/.test(
      token
    );
  }


  #isAttributeToken(token) {

    /*
     * Les attributs du dictionnaire ont soit :
     *
     * key
     * key=value
     *
     * Les composants de specification commencent par
     * N, X, Y, Z, éventuellement précédés de [.
     */
    return !/^\[?[NXYZ]/.test(token);
  }


  #parseAIRange(expression) {

    if (/^\d+$/.test(expression)) {

      const value =
        Number(expression);

      return {
        min: value,
        max: value
      };
    }


    const match =
      expression.match(
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


  #parseSpecification(specification) {

    return specification.map(token => {

      let optional = false;
      const parts =
        token.split(",");


      let typeAndLength =
        parts.shift();



      if (
        typeAndLength.startsWith("[") &&
        typeAndLength.endsWith("]")
      ) {

        optional = true;

        typeAndLength =
          typeAndLength.substring(
            1,
            typeAndLength.length - 1
          );
      }


      const type =
        typeAndLength.substring(0, 1);


      const length =
        typeAndLength.substring(1);


      let min;
      let max;
      let fixed = false;


      if (/^\d+$/.test(length)) {

        min =
          Number(length);

        max =
          Number(length);

        fixed = true;

      } else {

        const range =
          length.match(
            /^\.\.(\d+)$/
          );


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
        linters: parts
      };
    });
  }


  // ===========================================================================
  // DICTIONARY SEMANTICS
  // ===========================================================================

  isDigitalLinkPrimaryKey(definition) {

    /*
     * UNIQUE SOURCE OF TRUTH :
     *
     * un AI est une primary key uniquement si son entrée
     * contient l'attribut "dlpkey".
     */
    return Object.hasOwn(
      definition.attributes,
      "dlpkey"
    );
  }


  #getDLPKeySequences(definition) {

    if (
      !Object.hasOwn(
        definition.attributes,
        "dlpkey"
      )
    ) {
      return [];
    }


    const value =
      definition.attributes.dlpkey;


    /*
     * dlpkey sans valeur :
     *
     * dlpkey
     *
     * => primary key sans qualifier.
     */
    if (
      value === true ||
      value === ""
    ) {
      return [[]];
    }


    /*
     * Exemple :
     *
     * dlpkey=22,10,21|235
     *
     * =>
     *
     * [
     *   ["22", "10", "21"],
     *   ["235"]
     * ]
     */
    return String(value)
      .split("|")
      .map(
        sequence =>
          sequence
            ? sequence
              .split(",")
              .map(
                ai =>
                  this.normalizeAI(ai)
              )
            : []
      );
  }


  #validateQualifierSequence(
    primaryDefinition,
    qualifiers
  ) {

    const sequences =
      this.#getDLPKeySequences(
        primaryDefinition
      );


    const actual =
      qualifiers.map(
        qualifier =>
          typeof qualifier === "string"
            ? qualifier
            : qualifier.ai
      );


    /*
     * dlpkey sans qualifiers.
     */
    if (
      sequences.length === 1 &&
      sequences[0].length === 0
    ) {

      if (actual.length > 0) {
        throw new GS1DigitalLinkError(
          `Primary key ${primaryDefinition.expression} does not accept qualifiers.`
        );
      }

      return;
    }


    /*
     * Une séquence dlpkey représente une liste
     * de qualifiers optionnels mais ordonnés.
     *
     * Exemple :
     *
     * 22,10,21
     *
     * accepte :
     *
     * 22
     * 22,10
     * 22,10,21
     * 10
     * 10,21
     * 21
     *
     * mais pas :
     *
     * 10,22
     */
    const matches =
      sequences.some(
        sequence => {

          if (
            actual.length > sequence.length
          ) {
            return false;
          }


          /*
           * La séquence réelle doit être une
           * sous-séquence ordonnée de la séquence dlpkey.
           */
          let position = 0;


          for (
            const ai of actual
          ) {

            while (
              position < sequence.length &&
              sequence[position] !== ai
            ) {
              position++;
            }


            if (
              position >= sequence.length
            ) {
              return false;
            }


            position++;
          }


          return true;
        }
      );


    if (!matches) {

      throw new GS1DigitalLinkError(
        `Invalid qualifier sequence for primary key ${primaryDefinition.expression}.`,
        {
          primaryKey:
            primaryDefinition.expression,

          actual,

          allowed:
            sequences
        }
      );
    }


    /*
     * Un qualifier doit lui-même être un AI connu.
     *
     * Aucun tableau de qualifiers n'est codé en dur.
     */
    for (const ai of actual) {

      const definition =
        this.getAI(ai);


      if (!definition) {
        throw new GS1DigitalLinkError(
          `Unknown qualifier AI: ${ai}`
        );
      }
    }
  }


  // ===========================================================================
  // AI VALIDATION
  // ===========================================================================

  validateAIValue(ai, value) {

    const definition =
      this.getAI(ai);


    if (!definition) {
      throw new GS1DigitalLinkError(
        `Unknown GS1 Application Identifier: ${ai}`
      );
    }


    const stringValue =
      String(value);


    let offset = 0;


    for (
      let i = 0;
      i < definition.components.length;
      i++
    ) {

      const component =
        definition.components[i];


      /*
       * Si les données sont terminées et que le composant
       * est optionnel, on peut arrêter.
       */
      if (
        offset >= stringValue.length
      ) {

        if (
          component.optional
        ) {
          continue;
        }

        throw new GS1DigitalLinkError(
          `AI ${ai}: missing mandatory component.`
        );
      }


      let length;


      if (
        component.fixed
      ) {

        length =
          component.max;

      } else {

        /*
         * GS1 :
         * seul le dernier composant peut avoir une longueur variable.
         */
        if (
          i !==
          definition.components.length - 1
        ) {
          throw new GS1DigitalLinkError(
            `AI ${ai}: variable-length component must be final.`
          );
        }


        length =
          stringValue.length - offset;
      }


      const componentValue =
        stringValue.substring(
          offset,
          offset + length
        );


      this.#validateComponent(
        ai,
        componentValue,
        component
      );


      offset += length;
    }


    if (
      offset !== stringValue.length
    ) {
      throw new GS1DigitalLinkError(
        `AI ${ai}: unexpected trailing data.`
      );
    }


    return true;
  }


  #validateComponent(
    ai,
    value,
    component
  ) {

    if (
      value.length < component.min ||
      value.length > component.max
    ) {
      throw new GS1DigitalLinkError(
        `AI ${ai}: invalid component length.`
      );
    }


    let pattern;


    switch (component.type) {

      case "N":
        pattern = /^[0-9]+$/;
        break;

      case "X":
        /*
         * CSET 82.
         *
         * La validation complète CSET82 peut être branchée
         * via les linters GS1.
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


    /*
     * Les linters proviennent directement du dictionnaire.
     */
    for (
      const linter of component.linters
    ) {
      this.#runLinter(
        linter,
        ai,
        value
      );
    }
  }


  #runLinter(
    linter,
    ai,
    value
  ) {

    switch (linter) {

      case "csum":

        this.#validateCheckDigit(
          ai,
          value
        );

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
       * IMPORTANT :
       *
       * Les autres linters du Syntax Dictionary ne sont
       * volontairement PAS transformés en règles arbitraires.
       *
       * Le nom du linter est conservé dans le dictionnaire.
       *
       * On pourra ensuite brancher les implémentations GS1 :
       *
       * cset39
       * cset64
       * cset82
       * gcppos1
       * gcppos2
       * iban
       * iso3166
       * iso4217
       * yymmd0
       * ...
       */

      default:
        return;
    }
  }


  #validateCheckDigit(
    ai,
    value
  ) {

    if (
      !/^\d+$/.test(value)
    ) {
      throw new GS1DigitalLinkError(
        `AI ${ai}: check digit requires numeric data.`
      );
    }


    const body =
      value.substring(
        0,
        value.length - 1
      );


    const expected =
      this.#calculateMod10(body);


    const actual =
      Number(
        value[value.length - 1]
      );


    if (
      expected !== actual
    ) {
      console.error([value, body]);
      throw new GS1DigitalLinkError(
        `AI ${ai}: invalid check digit for ${value}. Expected ${expected}, got ${actual}.`
      );
    }
  }


  #calculateMod10(value) {

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
      10 -
      (sum % 10)
    ) % 10;
  }


  // ===========================================================================
  // EXTENSIONS
  // ===========================================================================

  #validateExtensionKey(key) {

    /*
     * Une extension ne peut pas être entièrement numérique,
     * sinon elle serait interprétée comme un AI.
     */
    if (
      /^\d+$/.test(key)
    ) {
      throw new GS1DigitalLinkError(
        `Extension key "${key}" cannot be numeric.`
      );
    }


    if (
      !/^[A-Za-z_][A-Za-z0-9._~:+/@!$'()*,-]*$/.test(
        key
      )
    ) {
      throw new GS1DigitalLinkError(
        `Invalid extension parameter key: ${key}`
      );
    }
  }


  // ===========================================================================
  // CANONICAL URI
  // ===========================================================================

  #isCanonical(parsed) {

    if (
      parsed.scheme.toLowerCase() !== "https"
    ) {
      return false;
    }


    if (
      parsed.hostname.toLowerCase() !==
      "id.gs1.org"
    ) {
      return false;
    }


    /*
     * Pas d'extension.
     */
    if (
      parsed.extensions.length > 0
    ) {
      return false;
    }


    const keys =
      parsed.dataAttributes.map(
        attribute =>
          attribute.ai
      );


    const sorted =
      [...keys].sort(
        (a, b) =>
          a.localeCompare(b)
      );


    return keys.every(
      (value, index) =>
        value === sorted[index]
    );
  }


  // ===========================================================================
  // HELPERS
  // ===========================================================================

  normalizeAI(ai) {

    const value =
      String(ai);


    if (
      !/^\d{2,4}$/.test(value)
    ) {
      throw new GS1DigitalLinkError(
        `Invalid GS1 Application Identifier: ${value}`
      );
    }


    return value;
  }

  #isNumeric(value) {
    return /^\d+$/.test(
      String(value)
    );
  }

  #encodePathSegment(value) {
    return encodeURIComponent(
      String(value)
    );
  }
}