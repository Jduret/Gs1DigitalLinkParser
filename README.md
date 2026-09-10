## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

# Liste des liens utiles

## GS1 définition
https://raw.githubusercontent.com/gs1/gs1-syntax-dictionary/2026-01-27/gs1-syntax-dictionary.txt

## Bibliothèques utilisées
https://blog.minhazav.dev/research/html5-qrcode
https://github.com/mebjas/html5-qrcode#extra-optional-configuration-in-start-method

## html5-qrcode se base lui même sur zxing
https://zxing-js.github.io/library/

## Choix pousser par le métier
https://www.scandit.com/products/barcode-scanner-sdk/
Ne sera pas utilisé, car payant sans apport réel.


## Comment utiliser

Une utilisation de base consiste à l'utiliser en s'appuyant sur le référentiel officiel gs1

```js
var gs1Helper = null;

GS1DigitalLink.fromGithubLastTag(
    'gs1', 
    'gs1-syntax-dictionary', 
    'gs1-syntax-dictionary.txt'
).then(gs1Result => {
    console.log('GS1 Parser Ready');

    gs1Helper = gs1Result;

    // A partir de maintenant on peut scanner les QrCodes
    console.log(
        gs1Helper.parse("https://boxinfo.apple.com/125787/01/00195951031026/21/HPQNJ76Q2J?8040=326159487032615&8041=123456789012345&8042=98765432109876543210987654321098")
    );

    console.log(
        gs1Helper.build({
            base : "https://id.gs1.org", 
            primaryKey :
            {
                ai : "01", 
                value: "00195951031026"
            }, 
            qualifiers : [
                {
                    ai: "21",
                    value: "HPQNJ76Q2J"
                },
            ],
            dataAttributes : [
                {
                    ai : "8040",
                    value: "326159487032615"
                },
                {
                    ai : "8041",
                    value: "123456789012345"
                },
                {
                    ai : "8042",
                    value: "98765432109876543210987654321098"
                },
            ],
            extensions : [],
            fragment : null,
            canonical : false
        })
    );
});
```