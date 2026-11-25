/* Diglet Aventuras: prototipo académico sin servicios externos. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const guardianDialog = $('#guardianDialog');
  const gameDialog = $('#gameDialog');
  const gameArea = $('#gameArea');
  const toastElement = $('#toast');
  const soundButton = $('#soundBtn');
  const completedKey = 'diglet_explorador_logros_v1';
  const activatedKey = 'diglet_adulto_confirmado_v1';
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* Keep session state. */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* Keep session state. */ } }
  };
  let activated = store.get(activatedKey) === 'si';
  let completed = (() => { try { const value = JSON.parse(store.get(completedKey) || '[]'); return new Set(Array.isArray(value) ? value.filter(v => ['quiz', 'memory', 'maze'].includes(v)) : []); } catch { return new Set(); } })();
  let activeGame = null;
  let soundOn = false;
  let audioContext = null;
  let toastHandle;
  let quizIndex = 0;
  let quizAnswered = false;
  let memoryValues = [];
  let memoryFlipped = [];
  let memoryMatched = new Set();
  let memoryBusy = false;
  let memoryMoves = 0;
  let mazePos = [0, 0];
  let mazeCollected = new Set();

  function toast(message) {
    toastElement.textContent = message;
    toastElement.classList.add('show');
    clearTimeout(toastHandle);
    toastHandle = setTimeout(() => toastElement.classList.remove('show'), 2800);
  }

  function beep(frequency = 540, duration = .11) {
    if (!soundOn) return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      audioContext ||= new Ctor();
      if (audioContext.state === 'suspended') audioContext.resume();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.08, audioContext.currentTime + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(); osc.stop(audioContext.currentTime + duration + .02);
    } catch { /* Audio is a progressive enhancement. */ }
  }

  soundButton.addEventListener('click', () => {
    soundOn = !soundOn;
    soundButton.setAttribute('aria-pressed', String(soundOn));
    soundButton.innerHTML = soundOn ? '♫ <span>Sonidos: sí</span>' : '♪ <span>Sonidos</span>';
    soundButton.setAttribute('aria-label', soundOn ? 'Desactivar sonidos' : 'Activar sonidos');
    if (soundOn) beep(740);
  });

  $$('.fact-more').forEach(button => button.addEventListener('click', () => {
    const paragraph = button.nextElementSibling;
    const expand = paragraph.hidden;
    paragraph.hidden = !expand;
    button.setAttribute('aria-expanded', String(expand));
    button.innerHTML = expand ? 'Mostrar menos <span aria-hidden="true">−</span>' : 'Descubre más <span aria-hidden="true">＋</span>';
    beep(600);
  }));

  function updateProgress() {
    $('#starCount').textContent = String(completed.size);
    $$('.medal').forEach(medal => {
      const earned = completed.has(medal.dataset.medal);
      medal.classList.toggle('earned', earned);
      $('small', medal).textContent = earned ? '¡Conseguida!' : 'Por descubrir';
    });
  }
  function updateActivation() {
    const activation = $('#guardianActivation');
    const label = $('.guardian-text strong', activation);
    const button = $('#guardianOpen');
    if (activated) {
      label.textContent = '¡Ya puedes jugar con Digi!';
      button.textContent = '✓ Juegos habilitados';
      $('.guardian-text span', activation).textContent = 'La aprobación del cuidador habilita el contenido educativo. No se registra ninguna toma.';
      button.disabled = true;
      $$('.button-game').forEach(b => { b.disabled = false; b.textContent = '¡Jugar ahora! ➜'; });
    } else {
      label.textContent = 'Un adulto abre la puerta de los juegos';
      button.textContent = 'Soy adulto · Habilitar juegos';
      $('.guardian-text span', activation).textContent = 'Los juegos se habilitan cuando el cuidador confirma que revisó las indicaciones de salud. No se necesita consumir ninguna tableta para jugar.';
      button.disabled = false;
      $$('.button-game').forEach(b => { b.disabled = true; b.textContent = '🔒 Habilitar con adulto'; });
    }
  }
  updateActivation(); updateProgress();
  $('#guardianOpen').addEventListener('click', () => guardianDialog.showModal());
  $$('[data-authorize]').forEach(button => button.addEventListener('click', () => {
    activated = true;
    store.set(activatedKey, 'si');
    guardianDialog.close();
    updateActivation();
    toast('¡Tres aventuras disponibles! Elige la que más te guste.');
    beep(780);
    $('#aventuras').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  [guardianDialog, gameDialog].forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));

  function win(game, title, detail) {
    const isFirst = !completed.has(game);
    completed.add(game);
    store.set(completedKey, JSON.stringify([...completed]));
    updateProgress();
    if (isFirst) { beep(780, .17); setTimeout(() => beep(980, .19), 140); }
    gameArea.innerHTML = `<div class="win-panel"><div class="win-icon" aria-hidden="true">🏆</div><h3>${title}</h3><p>${detail}</p><p><strong>★ ${isFirst ? '¡Una nueva estrella para tu pasaporte!' : '¡La estrella de esta misión ya es tuya!'}</strong></p><button type="button" id="winRetry">Jugar otra vez ↺</button></div>`;
    $('#winRetry').addEventListener('click', () => initGame(game));
  }

  const questions = [
    { q: '¿Qué mineral absorbe mejor tu cuerpo con ayuda de la vitamina D?', choices: ['El calcio', 'La arena', 'El papel'], answer: 0, tip: '¡Exacto! La vitamina D ayuda al cuerpo a absorber el calcio.' },
    { q: '¿Qué parte del cuerpo cuidamos con calcio y vitamina D?', choices: ['Los zapatos', 'Los huesos', 'Los lápices'], answer: 1, tip: '¡Muy bien! El calcio y la vitamina D ayudan a mantener huesos sanos.' },
    { q: '¿Cuál de estos alimentos puede aportar vitamina D?', choices: ['Una piedra', 'Un botón', 'El pescado graso'], answer: 2, tip: '¡Correcto! Algunos pescados son una fuente de vitamina D.' },
    { q: '¿Quién debe revisar si necesitas un suplemento?', choices: ['Un adulto con orientación sanitaria', 'Un personaje de videojuego', 'Un juguete'], answer: 0, tip: '¡Fantástico! Las vitaminas no se toman por ganar premios.' }
  ];
  function renderQuiz() {
    const current = questions[quizIndex];
    gameArea.innerHTML = `<p class="game-intro">Responde las preguntas y descubre cómo ayudar a Digi a completar su misión.</p><div class="quiz-status"><strong>${quizIndex + 1} / ${questions.length}</strong><div class="quiz-bar" role="progressbar" aria-valuenow="${quizIndex}" aria-valuemin="0" aria-valuemax="${questions.length}"><div class="quiz-fill" style="width:${quizIndex / questions.length * 100}%"></div></div><span>🦴</span></div><div class="quiz-question">${current.q}</div><div class="quiz-options" id="quizOptions"></div><div id="quizFeedback" class="quiz-feedback" aria-live="polite"></div>`;
    quizAnswered = false;
    current.choices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = choice;
      button.addEventListener('click', () => {
        if (quizAnswered) return;
        if (index === current.answer) {
          quizAnswered = true;
          $$('#quizOptions button').forEach(b => b.disabled = true);
          $('#quizFeedback').textContent = '✓ ' + current.tip;
          beep(810);
          const next = document.createElement('button');
          next.className = 'button button-sun'; next.style.marginTop = '14px';
          next.textContent = quizIndex === questions.length - 1 ? '¡Terminar misión! ★' : 'Siguiente pregunta ➜';
          next.addEventListener('click', () => {
            quizIndex++;
            if (quizIndex >= questions.length) win('quiz', '¡Misión del hueso completada!', 'Aprendiste que la vitamina D ayuda al cuerpo a absorber calcio y que un adulto cuida el uso de los suplementos.');
            else renderQuiz();
          });
          $('#quizFeedback').appendChild(document.createElement('br'));
          $('#quizFeedback').appendChild(next);
        } else {
          button.classList.add('wrong');
          $('#quizFeedback').textContent = 'Casi. ¡Prueba otra opción!';
          beep(260);
        }
      });
      $('#quizOptions').appendChild(button);
    });
  }

  const pairInfo = {
    sun: { icon: '☀️', label: 'La vitamina D ayuda al cuerpo a absorber calcio.' },
    bones: { icon: '🦴', label: 'El calcio es importante para los huesos.' },
    fish: { icon: '🐟', label: 'Los pescados grasos pueden aportar vitamina D.' },
    adult: { icon: '🧑‍⚕️', label: 'Los adultos y profesionales orientan el uso seguro de suplementos.' }
  };
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; }
    return array;
  }
  function startMemory() {
    memoryValues = shuffle([...Object.keys(pairInfo), ...Object.keys(pairInfo)]);
    memoryFlipped = []; memoryMatched = new Set(); memoryBusy = false; memoryMoves = 0;
    renderMemory();
  }
  function renderMemory() {
    gameArea.innerHTML = `<p class="game-intro">Toca dos cartas y busca dibujos iguales. ¡Encuentra las cuatro parejas!</p><div class="memory-counter">Parejas: <span id="memoryPairs">0</span> / 4 · Intentos: <span id="memoryMoves">0</span></div><div class="memory-grid" id="memoryGrid"></div><div class="memory-feedback" id="memoryFeedback" aria-live="polite"></div>`;
    memoryValues.forEach((key, index) => {
      const card = document.createElement('button');
      card.className = 'memory-card'; card.type = 'button';
      card.dataset.index = String(index);
      const shown = memoryFlipped.includes(index) || memoryMatched.has(index);
      card.textContent = shown ? pairInfo[key].icon : '?';
      card.setAttribute('aria-label', shown ? `Carta: ${key}` : `Carta oculta ${index + 1}`);
      if (shown) card.classList.add(memoryMatched.has(index) ? 'matched' : 'flipped');
      card.disabled = memoryMatched.has(index) || memoryBusy;
      card.addEventListener('click', () => turnMemoryCard(index));
      $('#memoryGrid').appendChild(card);
    });
    $('#memoryPairs').textContent = String(memoryMatched.size / 2);
    $('#memoryMoves').textContent = String(memoryMoves);
  }
  function turnMemoryCard(index) {
    if (memoryBusy || memoryMatched.has(index) || memoryFlipped.includes(index)) return;
    memoryFlipped.push(index); beep(520);
    const card = $(`.memory-card[data-index="${index}"]`);
    card.textContent = pairInfo[memoryValues[index]].icon;
    card.classList.add('flipped');
    card.setAttribute('aria-label', `Carta: ${memoryValues[index]}`);
    if (memoryFlipped.length === 2) {
      memoryBusy = true; memoryMoves++;
      $('#memoryMoves').textContent = String(memoryMoves);
      const [i, j] = memoryFlipped;
      if (memoryValues[i] === memoryValues[j]) {
        memoryMatched.add(i); memoryMatched.add(j);
        $('#memoryFeedback').textContent = '¡Pareja encontrada! ' + pairInfo[memoryValues[i]].label;
        beep(840);
        memoryFlipped = [];
        setTimeout(() => {
          if (activeGame !== 'memory' || !gameDialog.open) return;
          if (memoryMatched.size === memoryValues.length) win('memory', '¡Memoria brillante!', `Encontraste las cuatro parejas en ${memoryMoves} intentos.`);
          else { memoryBusy = false; renderMemory(); $('#memoryFeedback').textContent = pairInfo[memoryValues[i]].label; }
        }, 650);
      } else {
        $('#memoryFeedback').textContent = '¡Sigue buscando, explorador!';
        setTimeout(() => { if (activeGame !== 'memory' || !gameDialog.open) return; memoryFlipped = []; memoryBusy = false; renderMemory(); }, 880);
      }
    }
  }

  const walls = new Set(['1,1', '3,1', '1,3', '3,3']);
  const tokens = { '2,0': {icon: '☀️', label: 'vitamina D'}, '3,2': {icon:'🥛', label:'calcio'}, '2,4': {icon:'🦴', label:'huesos'} };
  const goal = '4,4';
  function startMaze() { mazePos = [0, 0]; mazeCollected = new Set(); renderMaze(); }
  function renderMaze(message='Usa las flechas o toca una casilla vecina.') {
    gameArea.innerHTML = '<p class="game-intro">¡Guía a Digi hasta la estrella! Reúne tres pistas por el camino y evita las montañas.</p><div class="maze-status"><span class="maze-pill">Pistas: <strong id="mazeCount">0</strong> / 3</span><span class="maze-pill">Meta: ⭐</span></div><div id="mazeGrid" class="maze-grid" aria-label="Laberinto de cinco por cinco casillas"></div><div class="maze-feedback" id="mazeFeedback" aria-live="polite"></div><div class="maze-controls" aria-label="Controles para mover a Digi"><button type="button" data-move="up" aria-label="Mover arriba">↑</button><button type="button" data-move="left" aria-label="Mover izquierda">←</button><button type="button" data-move="down" aria-label="Mover abajo">↓</button><button type="button" data-move="right" aria-label="Mover derecha">→</button></div><p class="game-hint">También puedes usar las flechas del teclado.</p>';
    const grid = $('#mazeGrid');
    for (let y=0; y<5; y++) for (let x=0; x<5; x++) {
      const tile = document.createElement('button');tile.type='button';
      tile.className='maze-cell';
      const cell=`${x},${y}`;
      const isPlayer=mazePos[0]===x && mazePos[1]===y;
      let icon='·',label='Camino libre';
      if (walls.has(cell)){icon='⛰️';label='Montaña bloqueada';tile.classList.add('wall');}
      else if (isPlayer){icon='🦸';label='Digi está aquí';tile.classList.add('player');}
      else if (cell===goal){icon='⭐';label='Meta';tile.classList.add('finish');}
      else if (tokens[cell] && !mazeCollected.has(cell)){icon=tokens[cell].icon;label='Pista de '+tokens[cell].label;tile.classList.add('token');}
      tile.textContent=icon;
      tile.setAttribute('aria-label',`${label}, fila ${y+1}, columna ${x+1}`);
      tile.addEventListener('click',()=>moveTo(x,y));
      grid.appendChild(tile);
    }
    $('#mazeCount').textContent=String(mazeCollected.size);
    $('#mazeFeedback').textContent=message;
    $$('[data-move]').forEach(button=>button.addEventListener('click',()=>moveMaze(button.dataset.move)));
  }
  function moveMaze(dir){
    const vectors={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
    const [dx,dy]=vectors[dir]||[0,0]; moveTo(mazePos[0]+dx,mazePos[1]+dy);
  }
  function moveTo(x,y){
    if (activeGame!=='maze' || !gameDialog.open) return;
    if(x<0||x>4||y<0||y>4 || Math.abs(x-mazePos[0])+Math.abs(y-mazePos[1])!==1){beep(270);return;}
    const cell=`${x},${y}`;
    if(walls.has(cell)){renderMaze('¡Hay una montaña! Busca otra ruta.');beep(260);return;}
    mazePos=[x,y]; let msg='¡Muy bien! Sigue adelante.';
    if(tokens[cell]&&!mazeCollected.has(cell)){mazeCollected.add(cell);msg=`¡Encontraste la pista ${tokens[cell].label}!`;beep(780);}
    else beep(570);
    if(cell===goal){
      if(mazeCollected.size===3){win('maze','¡Llegaste a la meta!','Digi encontró la vitamina D, el calcio y los huesos: un gran equipo para aprender a cuidarse.');return;}
      msg=`¡Ya casi! Te faltan ${3-mazeCollected.size} pistas para completar la misión.`;
    }
    renderMaze(msg);
  }
  document.addEventListener('keydown', e=>{
    if(activeGame!=='maze'||!gameDialog.open)return;
    const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
    if(map[e.key]){e.preventDefault();moveMaze(map[e.key]);}
  });

  const gameTitles={quiz:['MISIÓN 01 · CONOCIMIENTOS','La misión del hueso fuerte'],memory:['MISIÓN 02 · MEMORIA','Memoria de súper alimentos'],maze:['MISIÓN 03 · EXPLORACIÓN','La ruta secreta de Digi']};
  function initGame(game){
    activeGame=game;
    $('#gameKicker').textContent=gameTitles[game][0];
    $('#gameTitle').textContent=gameTitles[game][1];
    if(game==='quiz'){quizIndex=0;renderQuiz();}
    if(game==='memory')startMemory();
    if(game==='maze')startMaze();
  }
  $$('[data-game]').forEach(button => button.addEventListener('click', () => {
    if(!activated)return;
    initGame(button.dataset.game);
    gameDialog.showModal();
    beep(670);
  }));
  $('#restartGame').addEventListener('click',()=>{if(activeGame)initGame(activeGame);});
  $('#resetProgress').addEventListener('click',()=>{
    if (!window.confirm('¿Quieres reiniciar tus estrellas de aprendizaje? Los juegos seguirán disponibles.')) return;
    completed.clear();store.remove(completedKey);updateProgress();toast('Tus estrellas se reiniciaron. ¡Puedes volver a ganarlas!');
  });
})();
