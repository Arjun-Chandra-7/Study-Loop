export interface Paper {
  authors: string;
  year: number;
  title: string;
  journal: string;
  /** resolves at https://doi.org/<doi> */
  doi: string;
}

export interface Band {
  id: "theta" | "alpha" | "gamma" | "40hz";
  name: string;
  range: string;
  /** representative frequency for the visual, Hz */
  hz: number;
  line: string;
  body: string;
  /** Landmark, peer-reviewed reading for this band. DOIs verified against Crossref. */
  papers: Paper[];
  experimental?: boolean;
}

/** Copy is deliberately hedged: associated with, explored, investigated. */
export const BANDS: Band[] = [
  {
    id: "theta",
    name: "Theta",
    range: "4–8 Hz",
    hz: 6,
    line: "Associated with memory encoding",
    body: "Frontal-midline theta is often observed during working-memory and sustained-attention tasks.",
    papers: [
      {
        authors: "Klimesch",
        year: 1999,
        title: "EEG alpha and theta oscillations reflect cognitive and memory performance: a review and analysis",
        journal: "Brain Research Reviews",
        doi: "10.1016/S0165-0173(98)00056-3",
      },
      {
        authors: "Jensen & Tesche",
        year: 2002,
        title: "Frontal theta activity in humans increases with memory load in a working memory task",
        journal: "European Journal of Neuroscience",
        doi: "10.1046/j.1460-9568.2002.01975.x",
      },
      {
        authors: "Cavanagh & Frank",
        year: 2014,
        title: "Frontal theta as a mechanism for cognitive control",
        journal: "Trends in Cognitive Sciences",
        doi: "10.1016/j.tics.2014.04.012",
      },
    ],
  },
  {
    id: "alpha",
    name: "Alpha",
    range: "8–12 Hz",
    hz: 10,
    line: "Associated with relaxed wakefulness",
    body: "Alpha activity is studied as a marker of how attention is gated — rising when the eyes close or the mind idles.",
    papers: [
      {
        authors: "Klimesch, Sauseng & Hanslmayr",
        year: 2007,
        title: "EEG alpha oscillations: the inhibition–timing hypothesis",
        journal: "Brain Research Reviews",
        doi: "10.1016/j.brainresrev.2006.06.003",
      },
      {
        authors: "Jensen & Mazaheri",
        year: 2010,
        title: "Shaping functional architecture by oscillatory alpha activity: gating by inhibition",
        journal: "Frontiers in Human Neuroscience",
        doi: "10.3389/fnhum.2010.00186",
      },
      {
        authors: "Foxe & Snyder",
        year: 2011,
        title: "The role of alpha-band brain oscillations as a sensory suppression mechanism during selective attention",
        journal: "Frontiers in Psychology",
        doi: "10.3389/fpsyg.2011.00154",
      },
    ],
  },
  {
    id: "gamma",
    name: "Gamma",
    range: "30–100 Hz",
    hz: 38,
    line: "Associated with binding & attention",
    body: "Fast gamma rhythms are explored in research on how the brain combines features into a single perception.",
    papers: [
      {
        authors: "Tallon-Baudry & Bertrand",
        year: 1999,
        title: "Oscillatory gamma activity in humans and its role in object representation",
        journal: "Trends in Cognitive Sciences",
        doi: "10.1016/S1364-6613(99)01299-1",
      },
      {
        authors: "Jensen, Kaiser & Lachaux",
        year: 2007,
        title: "Human gamma-frequency oscillations associated with attention and memory",
        journal: "Trends in Neurosciences",
        doi: "10.1016/j.tins.2007.05.001",
      },
      {
        authors: "Fries",
        year: 2009,
        title: "Neuronal gamma-band synchronization as a fundamental process in cortical computation",
        journal: "Annual Review of Neuroscience",
        doi: "10.1146/annurev.neuro.051508.135603",
      },
    ],
  },
  {
    id: "40hz",
    name: "40 Hz",
    range: "Experimental",
    hz: 40,
    line: "Gamma-entrainment research",
    body: "Early studies are investigating whether 40 Hz light and sound can entrain gamma rhythms. Findings are preliminary and it is not a treatment.",
    papers: [
      {
        authors: "Iaccarino et al.",
        year: 2016,
        title: "Gamma frequency entrainment attenuates amyloid load and modifies microglia",
        journal: "Nature",
        doi: "10.1038/nature20587",
      },
      {
        authors: "Martorell et al.",
        year: 2019,
        title: "Multi-sensory gamma stimulation ameliorates Alzheimer’s-associated pathology and improves cognition",
        journal: "Cell",
        doi: "10.1016/j.cell.2019.02.014",
      },
      {
        authors: "Soula et al.",
        year: 2023,
        title: "Forty-hertz light stimulation does not entrain native gamma oscillations in Alzheimer’s disease model mice",
        journal: "Nature Neuroscience",
        doi: "10.1038/s41593-023-01270-2",
      },
    ],
    experimental: true,
  },
];
