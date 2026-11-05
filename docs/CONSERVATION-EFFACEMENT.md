# Conservation et effacement : plan d’implémentation

## Décisions client

Un accès arrive à échéance un an après sa création, sauf renouvellement explicite. À échéance, retirer l’accès à l’entreprise concernée ; supprimer le compte Keycloak seulement lorsqu’il ne dispose plus d’aucun accès. Une suppression complète doit couvrir les copies et sous-traitants, avec exceptions légales documentées.

## État et limites

Ce mécanisme n’est pas actuellement automatique. Le registre contient la date de création d’un tenant, pas celle de chaque appartenance utilisateur. Les invitations Keycloak créent des groupes et des membres, mais ne conservent ni date d’appartenance exploitable ni preuve de renouvellement. Utiliser la date du tenant ou celle d’un autre accès risquerait de retirer prématurément des droits. Les leads sont stockés dans un fichier partagé et attribués par domaine, qui ne prouve pas une propriété exclusive ; les supprimer par domaine peut effacer des informations d’un autre client. Les sauvegardes, les données transmises aux fournisseurs, les exports et les logs doivent être inventoriés avant de déclarer l’effacement complet.

## Travaux nécessaires avant activation

1. Enregistrer pour chaque lien utilisateur-tenant une date de début fiable et une échéance, et conserver la preuve, l’acteur et la date d’un renouvellement explicite. Pour les accès existants, réconcilier Keycloak et le registre ; laisser en revue manuelle toute date inconnue, sans la déduire automatiquement de la création du tenant.
2. Prévoir un aperçu et un journal d’opérations sans contenu personnel, une exécution idempotente et une reprise après échec. Vérifier l’absence d’accès restants dans Keycloak avant la suppression d’un compte ; traiter séparément les realms dédiés et les identités partagées. Révoquer les sessions et vérifier les groupes, organisations et rôles effectifs.
3. Mettre en place l’inventaire et l’effacement tenant par tenant des jeux SQLite, rapports, secrets, caches, fichiers historiques et données attribuables ; définir un traitement séparé des leads partagés, exports et obligations de conservation. Éviter de supprimer des données d’autres entreprises.
4. Documenter les sauvegardes, rétentions fournisseur et procédures d’effacement ; garantir que la restauration ne réintroduit pas de données supprimées. Tester les échecs et la restauration après purge.
5. Exécuter d’abord des essais sur données fictives et un inventaire sans suppression ; n’activer l’ordonnancement qu’après vérification de l’ensemble du parcours, y compris alertes et renouvellement explicite.
