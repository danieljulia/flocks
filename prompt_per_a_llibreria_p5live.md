# Prompt: Llibreria de Live Coding de Flocs per a p5live

## Context i Instruccions
Copia i enganxa el text següent a la IA quan vulguis generar la primera versió del codi de la teva llibreria i l'exemple.

---

### PROMPT INICI

> **Paper / Rol:** Ets un expert en P5.js, Live Coding i disseny d'APIs/llibreries creatives.
>
> **Objectiu:** Dissenya i codifica una primera versió d'una llibreria helper en JavaScript pensada específicament per ser utilitzada a **p5live** durant sessions de *live coding* "from scratch".
>
> **Filosofia de disseny (Live Coding Friendly):**
> - **Sintaxi d'alta velocitat:** Poc codi, noms de mètodes curts i encadenables (*method chaining*).
> - **Tolerant a fallades:** Valors per defecte sensats per poder veure resultats visuals immediats només instantiant un floc (`f = flock()`).
> - **Dinamisme total:** Permetre afegir/eliminar flocs i ocells "on-the-fly" sense reiniciar l'esquetx.
>
> ---
>
> ### 1. Especificacions de la Llibreria
>
> #### A. Control d'Àudio Ambient (Built-in)
> - La llibreria ha d'inicialitzar l'entrada de micro/àudio ambient (`p5.AudioIn`) i un anàlisi FFT (`p5.FFT`).
> - Ha d'exposar de forma senzilla 3 bandes de freqüència normalitzades o fàcils d'aplicar: **Baixes (Bass/Low)**, **Mitjanes (Mid)** i **Altes (Treble/High)**.
> - Concretament, ha de definir les funcions globals `bass()`, `mid()` i `treble()` (valors normalitzats 0..1), més una `amp()` amb el nivell general de so ambient.
> - Aquests valors d'àudio s'han de poder modular o assignar directament a propietats dels flocs (velocitat, radi, color...).
>
> #### B. Sistema de Flocs (*Flocks*) i Ocells (*Birds*)
> - **Ocells (*Birds*):**
>   - Visualització bàsica: Cercles d'un radi determinat.
>   - Moviment: Tenen velocitat i direcció determinada per un camp de soroll (*Perlin Noise field*).
>   - Comportament de pantalla: *Torus/Wrap-around* (quan surten per un extrem, reapareixen per l'oposat).
>   - Posició inicial: Aleatòria per defecte.
>
> - **Flocs (*Flocks*):**
>   - Cada floc conté un conjunt d'ocells (per defecte, p. ex., 20 ocells).
>   - Propietats configurables: Color, radi, velocitat base, escala del soroll (*noise scale*), reactivitat a l'àudio.
>   - Mètodes dinàmics: `add(n)`, `remove(n)`, `setColor()`, `setSpeed()`, `setRadius()`, etc.
>   - Mètode principal actualització/dibuix: `.draw()` o `.update()`.
>
> ---
>
> ### 2. Què has de generar?
>
> 1. **Codi de la Llibreria (JS pur compacte):**
>    - Organitzat de forma llegible però concisa per poder-lo incloure fàcilment a p5live (o carregar com a script/tab).
>    - Gestió automàtica de l'àudio per no haver de fer setup feixuc de p5.sound.
>
> 2. **Exemple de Live Coding de Demostració:**
>    - Un esquetx de p5live **molt curt, visualment impressionant i expressiu**.
>    - Que mostri:
>      - Creació de 2 o 3 flocs diferents (p. ex. un de gegant reactiu als baixos, un de ràpid i petit reactiu als aguts).
>      - Modificació d'un floc "on-the-fly".
>      - Ús del soroll i l'àudio ambient en poques línies.

---
### PROMPT FI