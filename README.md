# TaskBridge Live

**Read the brief. Know what to do.** A browser reader for students working with German assignment instructions in a second language. Paste a brief or open a fictional example. Get a checklist with English, German or French guidance, the exact German source, and a way to test the decisions the text supports.

## Try it in 30 seconds

Open **index.html** in a browser. From GitHub, use **Code → Download ZIP**, unzip it and open the HTML file. Use **EN**, **DE** or **FR** to switch the interface. No account, API key, install or build is needed.

1. Open **Choose one** and click **Try a common mistake**. The sample plan includes both options; the reader flags the mistake.
2. Click **Line 3** to see the precise instruction in the original. Uncheck one option and choose **Check my plan**.
3. Open **Only if**. Say whether Moodle is unavailable. The email fallback replaces the regular upload only when the text explicitly makes it an alternative.
4. Choose **Date pending** or **Two dates** to see why the reader refuses to promote a date. Then paste a short German brief and click **Read requirements**.

The examples are fictional. The reader analyzes new text in the browser. Interface labels, guidance, feedback and exports follow your language choice. Source excerpts stay in German; switching the interface keeps your selections. It does not answer the assignments.

## Why this needs the model

A plain translation leaves the learner to work out which clauses require action. A compact supervised model classifies German clauses into eight instruction types. The model learns character and word patterns from 187 original, labeled examples. It makes the difference between a context sentence, an instruction and a delivery step when an explicit keyword alone would not settle it. For example, the public JKU Linz excerpt about uploading a PDF becomes a delivery item with the learned weights and a review item when those weights are removed.

A separate, conservative layer handles explicit choice and condition markers, requires real date text before displaying a deadline, checks calendar validity, and stores the exact offsets of every citation. Event times are not submission deadlines; group-specific deadlines stay flagged for review. Choices and conditions that cannot be safely resolved remain for the learner to review. The plan checker evaluates the selected options against the extracted structure. The classifier is not used to create source text.

## Evidence and reproducibility

- **44 of 48** top-label predictions matched the authored evaluation labels. Those exact clauses were excluded from training. Four of the six conditional examples were misclassified by the raw model; the reader therefore uses explicit condition checks before accepting ordinary model predictions.
- **Five public excerpts** passed their documented interpretation checks. The test includes a pending date, a relative date, an exam time, a single-choice instruction whose options are outside the excerpt, and a PDF submission instruction. Removing all learned weights reduced the same spot checks to four of five. This is a small ablation, not a study of student outcomes.
- **22 automated checks** cover the reader and its built interface scripts, including all three languages, selection and evidence preservation, clipboard output, explicit fallbacks and date uncertainty.

Run the same checks with Node.js 20+:

    node --test *.test.js
    node evaluate.js

The public snippets and links are in [public-excerpts.json](public-excerpts.json). Only short excerpts are reproduced for verification; the linked institutions retain rights to their material. The training and evaluation clauses are synthetic. The evaluation checks informed the final rule layer; they are not a blind validation of the full product.

To rebuild the same standalone page from editable source:

    python3 build.py

The build writes index.html using the editable HTML, CSS and JavaScript alongside the trained model. To retrain, install the dependencies in requirements-training.txt, run python3 train_model.py, then run the build script. Normal use and the tests do not require Python packages or network access.

## Scope, accessibility and privacy

The input is a short German brief, up to 4,800 characters. The interface language does not change the input language. Mixed instructions, relative deadlines, unstated years or time zones, references to other documents, and variants outside the pasted text can need review. A checklist is an aid to reading; the original brief remains authoritative. Never paste identifying details you do not need.

No network calls, accounts, analytics, or API secrets in the app. Pasted text and plan selections stay in tab memory. Only the interface language preference is stored. The UI uses keyboard-operable form controls, source lines with focus, and status messages. EN, DE and FR guidance is available; original quotes are marked as German.

## Event contribution and disclosure

TaskBridge Live is a new implementation for SLAY HACKS 2026, started on 8 November 2026. The earlier TaskBridge practice lab used fixed exercises. The classifier, fresh examples, arbitrary-text reader, evidence offsets, and plan checks in this package were built for this project. OpenAI Codex assisted with implementation, synthetic data authoring, tests, and preparation of submission materials. No claim of a student study is made.
