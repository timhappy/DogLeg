import { program } from 'commander';
import { client } from './init-client';
import { Cia402State } from 'motion-master-client';

// ----------------------------------------------------------------------------------
// --- 1. STANDARD BEWEGUNGSKONFIGURATION (Fallback) ---
// Diese Werte werden verwendet, wenn in einem Schritt keine spezifischen Werte angegeben sind.
// ----------------------------------------------------------------------------------
const DEFAULT_MOTION_CONFIG = {
  velocity: 100000,
  acceleration: 120000,
  deceleration: 120000,
  window: 200000,
};

// ----------------------------------------------------------------------------------
// --- 2. HALTEZEITEN IN MILLISEKUNDEN ---
// ----------------------------------------------------------------------------------
const HOLD_TIMES_MS = {
  Start: 100,
  atStart: 5000,
  betweenSteps: 0,
  betweenSeq: 5000,
  betweenCycles: 5000,
  ASC_Timeout: 5000,
};

// ----------------------------------------------------------------------------------
// --- 3. KONFIGURATION DER BEWEGUNGSSCHRITTE ---
// ----------------------------------------------------------------------------------

// Definiert, welche Parameter ein Bewegungsschritt haben kann
interface MotionStepConfig {
  target: number;
  velocity?: number;
  acceleration?: number;
  deceleration?: number;
  window?: number;
}

// --- STARTPOSITIONEN ---
// Auch die Fahrt zur Startposition kann eigene Bewegungsparameter haben.
const START_POSITIONS: Map<string | number, MotionStepConfig>[] = [
  // --- Schritt 1: lift leg (start) ---
  new Map([
    [1, { target: -720000, velocity: 100000 }],
    [2, { target: -200000, velocity: 100000 }],
  ]),
  // --- Schritt 2: set it to ground ---
  new Map([
    [1, { target: -710000, velocity: 100000 }],
    [2, { target: -34000, velocity: 100000 }],
  ]),  
  // --- Schritt 2: set it to ground ---
  new Map([
    [1, { target: 1300000, velocity: 100000 }],
    [2, { target: 2900000, velocity: 100000 }],
  ]),  
];

// --- STARTPOSITIONEN ---
// Auch die Fahrt zur Startposition kann eigene Bewegungsparameter haben.
const STOP_POSITIONS: Map<string | number, MotionStepConfig>[] = [
   // --- Schritt 1: set it to ground ---
  new Map([
    [1, { target: -710000, velocity: 100000 }],
    [2, { target: -34000, velocity: 100000 }],
  ]),  
  new Map([
    [1, { target: -126000, velocity: 50000 }],
    [2, { target: -200000, velocity: 50000 }],
  ]),
  new Map([
    [1, { target: -126000, velocity: 50000 }],
    [2, { target: -21000, velocity: 50000 }],
  ]),  
];

//relation between the two joints
// This is used to scale the velocity of joint 2 relative to joint 1 depending on the link length.
const jointscale=1.7;

const UpperPosition_dev1 = 1030000; // Obere Position für Gelenk 1
const UpperPosition_dev2 = 2900000; // Obere Position für Gelenk 2
const LowerPosition_dev1 = -505000; // Untere Position für Gelenk 1
const LowerPosition_dev2 = 300000; // Untere Position für Gelenk 2

// --- SEQUENZ_1 "slow up and down"  DER ZIELPUNKTE ---
//Velocity for the motion
const vel_seq_1=100000;

// Jeder Schritt kann nun eigene Bewegungsparameter für jeden Antrieb definieren.
const SEQ_1_STEPS: Map<string | number, MotionStepConfig>[] = [
  // --- Schritt 1: Untere Position (start) ---
  new Map([
    [1, { target: LowerPosition_dev1, velocity: vel_seq_1 }],
    [2, { target: LowerPosition_dev2, velocity: vel_seq_1 }],
  ]),

  // --- Schritt 2: Obere Position ---
  new Map([
    [1, { target: UpperPosition_dev1, velocity: vel_seq_1 }], //
    [2, { target: UpperPosition_dev2, velocity: (vel_seq_1 * jointscale), acceleration: 200000, deceleration: 200000 }], //
  ]),

  // --- Schritt 3: Untere Position ---
  new Map([
    [1, { target: LowerPosition_dev1, velocity: vel_seq_1 }],
    [2, { target: LowerPosition_dev2, velocity: (vel_seq_1 * jointscale), acceleration: 200000, deceleration: 200000}],
  ]),

  // --- Schritt 4: Obere Position ---
  new Map([
    [1, { target: UpperPosition_dev1, velocity: vel_seq_1 }], //
    [2, { target: UpperPosition_dev2, velocity: (vel_seq_1 * jointscale), acceleration: 200000, deceleration: 200000 }], //
  ]),

  // --- Schritt 5: Untere Position ---
  new Map([
    [1, { target: LowerPosition_dev1, velocity: vel_seq_1 }],
    [2, { target: LowerPosition_dev2, velocity: (vel_seq_1 * jointscale), acceleration: 200000, deceleration: 200000}],
  ]),
  // --- Schritt 4: Obere Position ---
  new Map([
    [1, { target: UpperPosition_dev1, velocity: vel_seq_1 }], //
    [2, { target: UpperPosition_dev2, velocity: (vel_seq_1 * jointscale), acceleration: 200000, deceleration: 200000 }], //
  ]),

  // --- Schritt 5: Untere Position ---
  new Map([
    [1, { target: LowerPosition_dev1, velocity: vel_seq_1 }],
    [2, { target: LowerPosition_dev2, velocity: (vel_seq_1 * jointscale), acceleration: 200000, deceleration: 200000}],
  ]),
  // --- Schritt 4: Obere Position ---
  new Map([
    [1, { target: UpperPosition_dev1, velocity: vel_seq_1 }], //
    [2, { target: UpperPosition_dev2, velocity: (vel_seq_1 * jointscale), acceleration: 200000, deceleration: 200000 }], //
  ]),

  // --- Schritt 5: Untere Position ---
  new Map([
    [1, { target: LowerPosition_dev1, velocity: vel_seq_1 }],
    [2, { target: LowerPosition_dev2, velocity: (vel_seq_1 * jointscale), acceleration: 200000, deceleration: 200000}],
  ]),
];

// --- HILFSFUNKTIONEN UND HAUPTLOGIK ---

program
  .requiredOption('--devices <devices>', 'Komma-getrennte Liste von Geräte-Referenzen');

program.parse();
const { devices } = program.opts();

const deviceRefs: (string | number)[] = devices
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean)
  .map((value: string) => /^\d+$/.test(value) ? Number(value) : value);

// Diese Funktion führt einen einzelnen, voll konfigurierbaren Bewegungsschritt aus.
async function executeMotionStep(deviceRef: string | number, config: MotionStepConfig) {
  // Setze die Bewegungsparameter für diesen Schritt. Nutze den spezifischen Wert
  // aus dem Step, oder den Standardwert als Fallback.
  await client.request.downloadMany([
    [deviceRef, 0x6081, 0, config.velocity ?? DEFAULT_MOTION_CONFIG.velocity],
    [deviceRef, 0x6083, 0, config.acceleration ?? DEFAULT_MOTION_CONFIG.acceleration],
    [deviceRef, 0x6084, 0, config.deceleration ?? DEFAULT_MOTION_CONFIG.deceleration],
    [deviceRef, 0x6067, 0, config.window ?? DEFAULT_MOTION_CONFIG.window],
    [deviceRef, 0x607A, 0, config.target], // Das Ziel für diesen Schritt
  ]);
  await client.request.applySetPoint(deviceRef);
  await client.whenTargetReached(deviceRef);
}

client.whenReady().then(async () => {
  console.log(`Starte voll konfigurierbare Sequenz für: ${deviceRefs.join(', ')}`);

  try {
    // --- INITIALISIERUNG ---
    console.log("Initialisiere alle Antriebe...");
    // Einmalig in den Profile Position Mode schalten
    await Promise.all(deviceRefs.map(ref => client.request.download(ref, 0x6060, 0, 1)));
    // Alle Antriebe parallel freigeben
    await Promise.all(deviceRefs.map(ref =>
      client.request.transitionToCia402State(ref, Cia402State.OPERATION_ENABLED))
    );
    console.log("Alle Antriebe sind betriebsbereit.");

    const readline = await import('node:readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (HOLD_TIMES_MS.Start > 0) {
      console.log(`Halte für ${HOLD_TIMES_MS.Start} ms...`);
      await new Promise(resolve => setTimeout(resolve, HOLD_TIMES_MS.Start));
      }

    let shouldContinue = true;    

    // --- FAHRT ZU DEN STARTPOSITIONEN ---
      for (const [stepIndex, stepMap] of START_POSITIONS.entries()) {
      console.log("Fahre alle Antriebe zu ihren Startpositionen...");
      console.log(`\n--- Führe Schritt ${stepIndex + 1} / ${START_POSITIONS.length} aus ---`);
      
      await Promise.all(deviceRefs.map(ref => {
        const stepConfig = stepMap.get(ref);
        if (stepConfig) {
        console.log(`[Drive ${ref}] Ziel: ${stepConfig.target}, v=${stepConfig.velocity ?? 'default'}, a=${stepConfig.acceleration ?? 'default'}`);
        return executeMotionStep(ref, stepConfig);
        }
        return Promise.resolve();
      }));
      
      console.log(`Schritt ${stepIndex + 1} abgeschlossen.`);
      if (HOLD_TIMES_MS.betweenSteps > 0) {
        console.log(`Halte für ${HOLD_TIMES_MS.betweenSteps} ms...`);
        await new Promise(resolve => setTimeout(resolve, HOLD_TIMES_MS.betweenSteps));
      }
      } 
      
    while (shouldContinue) {
      
       // --- SEQ 1 AUSFÜHREN ---
      /* for (const [stepIndex, stepMap] of SEQ_1_STEPS.entries()) {
      console.log(`\n--- Führe Schritt ${stepIndex + 1} / ${SEQ_1_STEPS.length} aus ---`);
      
      await Promise.all(deviceRefs.map(ref => {
        const stepConfig = stepMap.get(ref);
        if (stepConfig) {
        console.log(`[Drive ${ref}] Ziel: ${stepConfig.target}, v=${stepConfig.velocity ?? 'default'}, a=${stepConfig.acceleration ?? 'default'}`);
        return executeMotionStep(ref, stepConfig);
        }
        return Promise.resolve();
      }));
      
      console.log(`Schritt ${stepIndex + 1} abgeschlossen.`);
      if (HOLD_TIMES_MS.betweenSteps > 0) {
        console.log(`Halte für ${HOLD_TIMES_MS.betweenSteps} ms...`);
        await new Promise(resolve => setTimeout(resolve, HOLD_TIMES_MS.betweenSteps));
      }
      }   

      console.log(`Next Sequence`);
      if (HOLD_TIMES_MS.betweenSeq > 0) {
      console.log(`Halte für ${HOLD_TIMES_MS.betweenSeq} ms...`);
      await new Promise(resolve => setTimeout(resolve, HOLD_TIMES_MS.betweenSeq));
      } 
   
      console.log("\nAlle Sequenz-Schritte erfolgreich abgeschlossen.");
*/
      /* // --- FAHRT ZU DEN STOPPOSITIONEN ---
      for (const [stepIndex, stepMap] of STOP_POSITIONS.entries()) {
      console.log("Fahre alle Antriebe zu ihren Stoppositionen...");
      console.log(`\n--- Führe Schritt ${stepIndex + 1} / ${STOP_POSITIONS.length} aus ---`);
      
      await Promise.all(deviceRefs.map(ref => {
        const stepConfig = stepMap.get(ref);
        if (stepConfig) {
        console.log(`[Drive ${ref}] Ziel: ${stepConfig.target}, v=${stepConfig.velocity ?? 'default'}, a=${stepConfig.acceleration ?? 'default'}`);
        return executeMotionStep(ref, stepConfig);
        }
        return Promise.resolve();
      }));
      
      console.log(`Schritt ${stepIndex + 1} abgeschlossen.`);
      if (HOLD_TIMES_MS.betweenCycles > 0) {
        console.log(`Halte für ${HOLD_TIMES_MS.betweenCycles} ms...`);
        await new Promise(resolve => setTimeout(resolve, HOLD_TIMES_MS.betweenCycles));
      }
      }  */

      // Wait for user to press any key to stop, otherwise continue automatically
      if (process.stdin.isTTY) {
        console.log('\nDrücke eine beliebige Taste, um die Sequenz zu beenden. Die Sequenz läuft weiter...');
        process.stdin.setRawMode(true);
        process.stdin.resume();
        shouldContinue = true;
        await new Promise<void>(resolve => {
          process.stdin.once('data', () => {
        shouldContinue = false;
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve();
          });
          // Continue immediately, don't wait for keypress
          setTimeout(resolve, 0);
        }); 
      } else {
        // If not TTY, just continue
        shouldContinue = true;
      }
    }

    client.request.quickStop(1,true);
    client.request.quickStop(2,true);
    console.log(`Clients are stopped`);
    await new Promise(resolve => setTimeout(resolve, HOLD_TIMES_MS.ASC_Timeout));

    rl.close();

  } catch (error) {
    console.error("Ein Fehler ist in der Sequenz aufgetreten:", error);
  } finally {
    // --- AUFRÄUMEN ---
    console.log("Deaktiviere alle Antriebe...");
    try {
      await Promise.all(deviceRefs.map(ref =>
        client.request.transitionToCia402State(ref, Cia402State.READY_TO_SWITCH_ON))
      );
    } catch (disableError) {
      console.error("Antriebe konnten nicht alle deaktiviert werden.", disableError);
    }
    console.log("Schließe Sockets.");
    client.closeSockets();
  }
});
