// ============================================================
//  CONFIG DU QUIZ – Gender reveal Manon & Benjamin
// ============================================================
//  part: 1        -> quiz avec bonne réponse (points + classement)
//                    choices : 2 à 4 propositions
//                    answer  : index (0-based) de la bonne réponse
//  part: 2        -> sondage Manon vs Benjamin (curseur, pas de points)
//  part: 'final'  -> question finale (curseur Fille / Garçon)
//
//  L'ordre d'affichage est : toutes les part 1, puis les part 2, puis 'final'.
// ============================================================

const QUI = ['Manon', 'Benjamin', 'Les deux', 'Personne'];
const MANON = 0, BENJAMIN = 1, LES_DEUX = 2, PERSONNE = 3;

// Raccourcis
const qui = (id, text, answer) => ({ id, part: 1, text, choices: QUI, answer });
const duel = (id, text) => ({ id, part: 2, text, left: 'Manon', right: 'Benjamin' });

module.exports = {
  durationSeconds: 20,

  // Lot du gagnant (affiché sur l'écran du grand gagnant). Laisser '' pour ne rien afficher.
  prize: '',

  questions: [
    // ======================= PARTIE 1 =======================
    { id: 1, part: 1, text: 'Où Manon et Benjamin se sont-ils rencontrés ?',
      choices: ['Au lycée', 'À une soirée entre amis', 'École d’apprentissage', 'Sur une appli de rencontre'], answer: 2 },
    { id: 2, part: 1, text: 'Depuis combien de temps sont-ils ensemble ?',
      choices: ['6 ans', '7 ans', '8 ans', '10 ans'], answer: 2 },
    { id: 3, part: 1, text: 'Depuis combien de temps vivent-ils ensemble ?',
      choices: ['3 ans 2 mois', '4 ans 7 mois', '5 ans', '6 ans 1 mois'], answer: 1 },
    qui(4, 'Qui a dit « je t’aime » en premier ?', BENJAMIN),
    qui(5, 'Qui a proposé leur premier rendez-vous ?', BENJAMIN),
    { id: 6, part: 1, text: 'Quel âge avaient-ils lorsqu’ils se sont rencontrés ?',
      choices: ['Manon 17 / Benjamin 19', 'Manon 18 / Benjamin 20', 'Manon 19 / Benjamin 21', 'Manon 18 / Benjamin 18'], answer: 1 },
    { id: 7, part: 1, text: 'Où ont-ils passé leurs premières vacances ensemble ?',
      choices: ['Biarritz', 'Annecy', 'Cahors', 'Marseille'], answer: 2 },
    qui(8, 'Qui est le plus organisé ?', LES_DEUX),
    qui(9, 'Qui est le plus stressé pour rien ?', MANON),
    qui(10, 'Qui s’endort le plus rapidement ?', MANON),
    qui(11, 'Qui dépense le plus ?', BENJAMIN),
    qui(12, 'Qui est le plus bordélique ?', BENJAMIN),
    qui(13, 'Qui passe le plus de temps dans la salle de bain ?', MANON),
    qui(14, 'Qui est le plus mauvais perdant ?', BENJAMIN),
    qui(15, 'Qui est le plus souvent en retard ?', PERSONNE),
    qui(16, 'Qui est le plus têtu ?', LES_DEUX),
    qui(17, 'Qui change le plus souvent d’avis ?', BENJAMIN),
    qui(18, 'Qui râle le plus ?', MANON),
    qui(19, 'Qui est le plus gourmand ?', MANON),
    qui(20, 'Qui est le plus accro à son téléphone ?', MANON),
    qui(21, 'Qui perd le plus souvent ses affaires ?', BENJAMIN),
    qui(22, 'Qui met le plus de temps à choisir sa tenue ?', MANON),
    qui(23, 'Qui est le plus organisé pour les vacances ?', MANON),
    qui(24, 'Qui panique le plus facilement quand quelque chose ne se passe pas comme prévu ?', MANON),
    qui(25, 'Qui dépense le plus pour des achats inutiles ?', MANON),
    qui(26, 'Qui est le plus difficile lorsqu’il faut choisir un restaurant ?', LES_DEUX),
    qui(27, 'Qui dit le plus souvent « j’arrive » alors qu’il ou elle n’est pas encore prêt ?', BENJAMIN),
    qui(28, 'Qui voulait un chien ?', MANON),
    qui(29, 'Qui voulait un chat ?', BENJAMIN),
    { id: 30, part: 1, text: 'Où habitent Manon et Benjamin ?',
      choices: ['Villeurbanne', 'Lyon 6e', 'Caluire-et-Cuire', 'Rillieux-la-Pape'], answer: 2 },

    // ======================= PARTIE 2 =======================
    duel(31, 'Qui va être le premier à dire « je suis crevé » après une nuit avec bébé ?'),
    duel(32, 'Qui va chercher sur Google « bébé + symptôme » à 3 h du matin ?'),
    duel(33, 'Qui va envoyer un message à la famille pour annoncer chaque petite nouveauté ?'),
    duel(34, 'Qui va prendre le plus de photos pendant les premières 24 heures ?'),
    duel(35, 'Qui va verser sa petite larme le premier à la maternité ?'),
    duel(36, 'Qui va avoir le plus de mal à laisser bébé dans son lit et retourner dormir ?'),
    duel(37, 'Qui va apprendre le plus de chansons pour bébé ?'),
    duel(38, 'Qui va inventer les surnoms les plus improbables ?'),
    duel(39, 'Qui va dire « il/elle a grandi » tous les deux jours ?'),
    duel(40, 'Qui va se lever la nuit en disant « laisse, j’y vais » puis regretter immédiatement ?'),
    duel(41, 'Qui va être capable de dormir malgré les pleurs du bébé ?'),
    duel(42, 'Qui va se réveiller au moindre bruit ?'),
    duel(43, 'Qui va appeler l’autre en pleine nuit en disant « tu crois que c’est normal ça ? » ?'),
    duel(44, 'Qui va passer 20 minutes à choisir entre deux bodies alors que le bébé n’en aura rien à faire ?'),
    duel(45, 'Qui va acheter un jouet beaucoup trop gros pour la maison ?'),
    duel(46, 'Qui va dire « il n’a besoin de rien » puis revenir avec trois sacs de vêtements ?'),
    duel(47, 'Qui va vouloir prendre le bébé dans les bras dès qu’il pleure ?'),
    duel(48, 'Qui va essayer de négocier avec un bébé qui ne sait même pas parler ?'),
    duel(49, 'Qui va être incapable de dire non aux grands-parents quand ils vont trop gâter le bébé ?'),
    duel(50, 'Qui va envoyer une photo du bébé dans le groupe familial à 7 h du matin ?'),
    duel(51, 'Qui va avoir 500 photos identiques du bébé dans son téléphone ?'),
    duel(52, 'Qui va montrer une photo du bébé à quelqu’un en disant « regarde cette petite merveille » alors que la personne vient déjà de la voir ?'),
    duel(53, 'Qui va être le premier à acheter un cadeau au bébé sans aucune raison ?'),
    duel(54, 'Qui va vouloir habiller le bébé même quand il n’y a absolument aucune occasion ?'),
    duel(55, 'Qui va être le plus stressé lors de la première sortie avec bébé ?'),
    duel(56, 'Qui va vérifier trois fois que le sac à langer est complet avant de sortir ?'),
    duel(57, 'Qui va oublier quelque chose d’essentiel dans le sac à langer ?'),
    duel(58, 'Qui va dire « on rentre tôt ce soir » et finalement rentrer beaucoup plus tard ?'),
    duel(59, 'Qui va apprendre au bébé une bêtise en premier ?'),
    duel(60, 'Qui va être le plus susceptible de laisser bébé regarder un écran « juste cinq minutes » ?'),
    duel(61, 'Après un an de vie de parents, lequel des deux dira en premier : « On en fait un deuxième ? »'),

    // =================== QUESTION FINALE ====================
    { id: 62, part: 'final', text: 'Fille ou garçon ?', left: 'Fille', right: 'Garçon' },
  ],
};
