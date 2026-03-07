# DevLife 

## what even is this

so i built a game where an AI ghost watches you code. sounds weird right? but heres the thing. the ghost is connected to your actual body through a WHOOP wearable. it reads your heart rate, your recovery, your stress levels. in real time.

when youre relaxed and writing clean code, ghost chills. maybe drops a suggestion here and there. but when youre exhausted at 2am trying to force push to production? ghost literally blocks you. i call it the Fatigue Firewall.

## why tho

every dev has pushed garbage code when they were tired. i wanted to build something that actually knows when youre too fried to be making important decisions. not a timer. not a pomodoro app. something that reads your actual physiology and says "hey maybe dont delete the production database right now"

## the cool parts

- **real biometrics** — connects to WHOOP via bluetooth. your actual heartbeat shows up in the game
- **5 cognitive states** — relaxed, stressed, fatigued, deep focus, wired. ghost changes personality for each
- **fatigue firewall** — blocks dangerous commands when your body says youre cooked
- **apply fix** — ghost spots bugs in your code and can fix them with one click - this feature still needs time for developing, a bit hardcoded for the demo
- **sleep mode** — take off the wearable and the whole room goes dark. ghost whispers goodnight
- **the plant** — write good code, your plant grows. write bad code, it dies. simple as that. it should do that but there is a lot of testing to be done.

## tech stack

- for **fronted** i used: vanilla js, pixi js for the isometric room and canvas for ecg
- for **backend**: python, fastapi and websockets 
- **ai**:  claude api (for the best performance), claude vision api for the screen analysis
- **biometrics**: whoop api (dev one which token refreshes after 1h) and chrome bluetooth for the live bpm because the api doesnt transmit it
- **other**: vite and node for dev server


