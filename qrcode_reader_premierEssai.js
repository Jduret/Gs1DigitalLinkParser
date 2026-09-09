var qrCodeReader = {};

qrCodeReader.isValidUrl = function(urlString) {
    try {
        new URL(urlString);
        return true;
    } catch (e) {
        return false;
    }
}

qrCodeReader.decomposeURL = function(gs1Url)
{
  try {
        const urlObj = new URL(gs1Url);
        const chemin = urlObj.pathname;

        // Expression régulière pour capturer les paires /AI/valeur
        // Capture les structures standards /01/chiffres/10/texte, etc.
        const regex = /\/(\d{2,4})\/([^\/]+)/g;
        
        const correspondances = {};
        let match;

        // Parcours de l'URL pour extraire toutes les paires
        while ((match = regex.exec(chemin)) !== null) {
            const ai = match[1];
            const valeur = match[2];
            correspondances[ai] = valeur;
        }

        // Dictionnaire de traduction des Identifiants d'Application (AI) les plus courants
        const dictionnaireAI = {
            "01": "GTIN (Code Produit)",
            "10": "Numéro de lot",
            "17": "Date de péremption (AAMMJJ)",
            "21": "Numéro de série",
            "11": "Date de fabrication (AAMMJJ)",
            "13": "Date d'emballage (AAMMJJ)",
            "30": "Quantité d'articles",
            "8040": 'IMEI1',
            "8041": 'IMEI2',
        };

        // Structuration du résultat final
        const donneesDecomposees = {};
        for (const [ai, valeur] of Object.entries(correspondances)) {
            donneesDecomposees[ai] = {
                ai: ai,
                signification: dictionnaireAI[ai] || "Autre identifiant GS1",
                valeur: valeur
            };
        }

        return {
            domaine: urlObj.hostname,
            donnees: donneesDecomposees
        };

    } catch (e) {
        return { erreur: "URL invalide ou malformée" };
    }
}

qrCodeReader.ean13Scanner = function(ean13) {
    console.log('EAN13 detected');
    console.log('Validate and manage EAN13 : ' + ean13);
}

qrCodeReader.gs1Scanner = function(gs1Code) {
    console.log('GS1 detected');
    gs1 = qrCodeReader.decomposeURL(gs1Code);

    $('#qrCode').val(gs1.donnees['01'].valeur.substring(1) ?? "");
    qrCodeReader.ean13Scanner(gs1.donnees['01'].valeur.substring(1));

    
    $('#imei1').val(gs1.donnees['8040'].valeur ?? "");
    $('#imei2').val(gs1.donnees['8041'].valeur ?? "");
}

qrCodeReader.bindTo = function(element) {
    $('#qrCode').blur(function(input) {
        let code = $('#qrCode').val();
        // GS1 URL
        if(isValidUrl(code)) {
            qrCodeReader.gs1Scanner(code);
        }

        qrCodeReader.ean13Scanner(code);
  });
}

var example = "https://test-qrcode.com/01/00952432234433/10/ABC/8040/imei1?linktype='gs1:defaultlink'";

$(window).ready(function() {
  $('#qrCode').blur(function(input) {
    let code = $('#qrCode').val();
    // GS1 URL
    if(isValidUrl(code)) {
      console.log('GS1 detected');
      gs1 = decomposeURL(code);

      $('#imei1').val(gs1.donnees['8040'].valeur ?? "");
      $('#imei2').val(gs1.donnees['8041'].valeur ?? "");
      $('#qrCode').val(gs1.donnees['01'].valeur.substring(1) ?? "");
    }
    // Standard EAN13
    //...
  });
});

//https://boxinfo.apple.com/125787/01/00195951031026/21/HPQNJ76Q2J?8040=351927999506354&8041=351927997904288&8042=89043052010008887025036884863468
//https://test-qrcode.com/01/00952432234433/10/ABC?linktype="gs1:defaultlink"