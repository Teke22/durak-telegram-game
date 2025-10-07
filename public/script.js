/* safe Telegram WebApp wrapper */
const tg = window.Telegram?.WebApp ?? {
  expand() {}, enableClosingConfirmation() {}, HapticFeedback: { impactOccurred() {} },
  showPopup({ title, message }) { alert((title ? title + '\n' : '') + (message || '')); },
  initDataUnsafe: {}
};
tg.expand?.();
tg.enableClosingConfirmation?.();

const HAND_LIMIT = 6;
const SUITS = ["♠","♥","♦","♣"];
const RANKS = ["6","7","8","9","10","J","Q","K","A"];
const RANK_VALUES = { "6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14 };
const suitColorClass = s => (s === "♥" || s === "♦") ? "red" : "black";

/* DOM refs */
const seatsEl = document.getElementById('seats') || createPlaceholder('seats');
const gameBoard = document.getElementById('game-board') || createPlaceholder('game-board');
const startButton = document.getElementById('start-game') || createPlaceholder('start-game');
const toastContainer = document.getElementById('toast-container') || createPlaceholder('toast-container');

function createPlaceholder(id){
  const el = document.createElement('div'); el.id = id; document.body.appendChild(el); return el;
}
function showToast(text, timeout=1400){
  const t = document.createElement('div'); t.className='toast'; t.textContent = text;
  toastContainer.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),180); }, timeout);
}

/* state */
let state = {
  mode: new URLSearchParams(location.search).get('mode') || 'bot',
  // singleplayer
  deck: [], playerHand: [], botHand: [], trumpSuit: null, trumpCard: null,
  attacker: 'player', defender: 'bot', currentPlayer: 'player', phase: 'attacking', status: 'waiting',
  // multiplayer shadow
  isMultiplayer: false, gameId: null, playerId: null,
  seats: [], // {id,type,handCount}
  rawAttacker: null, rawDefender: null, rawCurrent: null, you: null,
  // visualization helpers
  opponentCount: 0
};

/* UI init */
function initInterface(){
  const mode = new URLSearchParams(location.search).get('mode') || 'bot';
  state.mode = mode;
  if (mode === 'bot') setupBotScreen();
  else if (mode === 'create') setupCreateScreen();
  else if (mode === 'join') setupJoinScreen();
  else setupBotScreen();
}
function setupBotScreen(){
  state.isMultiplayer = false;
  seatsEl.innerHTML = '';
  gameBoard.innerHTML = `
    <div style="text-align:center;color:white;padding:12px;">
      <h2>Игра с ботом</h2>
      <p>Классический режим 1 vs 1</p>
    </div>`;
  startButton.style.display = 'block';
  startButton.textContent = '🎮 Начать игру';
  startButton.onclick = initGameBot;
}

function setupCreateScreen(){
  state.isMultiplayer = true;
  seatsEl.innerHTML = '';
  gameBoard.innerHTML = `
    <div style="text-align:center;color:white;padding:12px;">
      <h2>Создать комнату</h2>
      <div style="margin-top:8px;">
        <label style="color:white">Мест:
          <select id="room-size"><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select>
        </label>
        <label style="color:white;margin-left:8px">Ботов:
          <select id="room-bots"><option>0</option><option>1</option><option>2</option><option>3</option></select>
        </label>
      </div>
    </div>`;
  startButton.style.display = 'block';
  startButton.textContent = 'Создать комнату';
  startButton.onclick = async ()=>{
    const size = Number(document.getElementById('room-size').value||2);
    const bots = Number(document.getElementById('room-bots').value||0);
    await createGame({ maxPlayers: size, botCount: bots, autostart: true });
  };
}

function setupJoinScreen(){
  state.isMultiplayer = true;
  startButton.style.display = 'none';
  gameBoard.innerHTML = `
    <div style="text-align:center;color:white;padding:12px;">
      <h2>Присоединиться по коду</h2>
      <input id="join-code" maxlength="6" placeholder="ABCDEF" style="padding:8px;border-radius:6px;border:none;width:120px;text-align:center;">
      <div style="margin-top:8px;"><button id="do-join">Присоединиться</button></div>
    </div>`;
  document.getElementById('do-join').onclick = ()=>{
    const code = (document.getElementById('join-code').value||'').toUpperCase().trim();
    if (code.length===6) { window.location.search = `?mode=join&gameId=${code}`; }
    else showToast('Введи код из 6 символов');
  };
}

/* ---------------- Singleplayer (bot) ---------------- */
function initGameBot(){
  startButton.style.display='none';
  state.deck = buildDeck(); shuffle(state.deck);
  state.trumpCard = state.deck[state.deck.length-1]; state.trumpSuit = state.trumpCard.suit;
  state.playerHand = drawMany(state.deck,6);
  state.botHand = drawMany(state.deck,6);
  sortHand(state.playerHand); sortHand(state.botHand);
  state.attacker='player'; state.defender='bot'; state.currentPlayer='player';
  state.phase='attacking'; state.status='playing'; state.table=[];
  renderAll();
}

/* Bot helper actions (local-only) - kept minimal */
function attackWithCardBot(cardIndex){
  const card = state.playerHand.splice(cardIndex,1)[0];
  state.table.push({ attack: card, defend: null });
  state.phase='defending'; state.currentPlayer='bot';
  renderAll();
  setTimeout(botMoveLocal, 300);
}
function defendWithCardBot(cardIndex){
  const last = state.table[state.table.length-1];
  if (!last || last.defend) return;
  const card = state.playerHand.splice(cardIndex,1)[0];
  last.defend = card;
  // check all defended
  const all = state.table.every(p => p.defend);
  if (all){
    // attacker becomes defender etc.
    state.phase='attacking'; state.currentPlayer = state.attacker = state.defender; state.defender = (state.attacker==='player'?'bot':'player');
    // draw and continue
    refillAfterRoundLocal(false);
  } else {
    state.currentPlayer = 'bot';
    renderAll();
    setTimeout(botMoveLocal, 400);
  }
}
function takeCardsLocal(){
  for (const p of state.table){ state.playerHand.push(p.attack); if (p.defend) state.playerHand.push(p.defend); }
  state.table = [];
  sortHand(state.playerHand); sortHand(state.botHand);
  // attacker keeps role
  refillAfterRoundLocal(true);
}
function passTurnLocal(){
  // bito
  state.table = [];
  refillAfterRoundLocal(false);
  showToast('Бито');
}
function refillAfterRoundLocal(defenderTook){
  // draw to 6, attacker-first rule
  const drawOne = hand => { if (state.deck.length) hand.push(state.deck.pop()); };
  const attackerHand = state.attacker==='player'? state.playerHand : state.botHand;
  const defenderHand = state.defender==='player'? state.playerHand : state.botHand;
  while ((attackerHand.length < HAND_LIMIT || defenderHand.length < HAND_LIMIT) && state.deck.length){
    if (attackerHand.length < HAND_LIMIT) drawOne(attackerHand);
    if (defenderHand.length < HAND_LIMIT) drawOne(defenderHand);
  }
  sortHand(state.playerHand); sortHand(state.botHand);
  // rotate roles: if defender took, roles unchanged; otherwise attacker becomes defender
  if (!defenderTook){
    const prevAtt = state.attacker;
    state.attacker = state.defender;
    state.defender = prevAtt;
  }
  state.phase='attacking';
  state.currentPlayer = state.attacker;
  renderAll();
  if (state.currentPlayer === 'bot') setTimeout(botMoveLocal, 300);
}
function botMoveLocal(){
  // very simple bot: either attack or defend minimally
  if (state.phase==='attacking'){
    // if table empty -> attack with smallest non-trump
    if (state.table.length===0){
      let idx = 0;
      // choose smallest value preferring non-trump
      let best = -1, bestVal = Infinity;
      for (let i=0;i<state.botHand.length;i++){
        const c = state.botHand[i];
        const val = (c.suit===state.trumpSuit? 100 + c.value : c.value);
        if (val < bestVal){ bestVal = val; best = i; }
      }
      if (best===-1){ passTurnLocal(); return; }
      const card = state.botHand.splice(best,1)[0];
      state.table.push({ attack: card, defend: null });
      state.phase='defending'; state.currentPlayer='player';
      showToast('Бот атакует');
      renderAll();
      return;
    } else {
      // maybe add card if ranks match and defender has room
      const ranks = new Set(); state.table.forEach(p=>{ ranks.add(p.attack.rank); if (p.defend) ranks.add(p.defend.rank); });
      if (state.table.length < (state.defender === 'player' ? state.playerHand.length : state.botHand.length)){
        for (let i=0;i<state.botHand.length;i++){
          if (ranks.has(state.botHand[i].rank)){
            const card = state.botHand.splice(i,1)[0];
            state.table.push({ attack: card, defend: null });
            state.phase='defending'; state.currentPlayer='player';
            renderAll(); return;
          }
        }
      }
      passTurnLocal(); return;
    }
  } else if (state.phase==='defending'){
    // defend last pair
    const last = state.table[state.table.length-1];
    if (!last || last.defend) { state.phase='attacking'; state.currentPlayer=state.attacker; renderAll(); return; }
    // find defense card
    let idx = -1;
    for (let i=0;i<state.botHand.length;i++){
      const c = state.botHand[i];
      if (c.suit === last.attack.suit && c.value > last.attack.value){ idx = i; break; }
      if (c.suit === state.trumpSuit && last.attack.suit !== state.trumpSuit){ idx = i; break; }
    }
    if (idx===-1){
      // take cards
      for (const p of state.table){ state.botHand.push(p.attack); if (p.defend) state.botHand.push(p.defend); }
      state.table = [];
      sortHand(state.botHand);
      showToast('Бот взял карты');
      refillAfterRoundLocal(true);
    } else {
      const card = state.botHand.splice(idx,1)[0];
      last.defend = card;
      const all = state.table.every(p => p.defend);
      if (all){
        showToast('Бот отбился');
        refillAfterRoundLocal(false);
      } else {
        state.currentPlayer = state.attacker;
        state.phase = 'attacking';
        renderAll();
      }
    }
  }
}

/* --- Helpers for deck/hand rendering --- */
function buildDeck(){
  const d=[];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank:r, suit:s, value: RANK_VALUES[r] });
  return d;
}
function shuffle(arr){
  for (let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
}
function drawMany(deck,n){ const out=[]; for (let i=0;i<n && deck.length>0;i++) out.push(deck.pop()); return out; }
function sortHand(hand){
  if (!Array.isArray(hand)) return;
  hand.sort((a,b)=>{
    const aT = a.suit === state.trumpSuit, bT = b.suit === state.trumpSuit;
    if (aT !== bT) return aT?1:-1;
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    return a.value - b.value;
  });
}

/* --- Rendering --- */
function renderAll(){
  renderSeats();
  gameBoard.innerHTML = '';
  // header / trump
  const header = document.createElement('div');
  header.innerHTML = `
    <h2>Подкидной дурак</h2>
    <div class="trump-info">
      <div>Козырь: <span style="font-weight:800">${state.trumpSuit || '—'}</span></div>
      <div class="trump-card">${state.trumpCard ? (state.trumpCard.rank + state.trumpCard.suit) : ''}</div>
    </div>
    <div class="game-status">${getStatusText()}</div>
  `;
  gameBoard.appendChild(header);

  // opponent compact fan
  renderOpponentArea();

  // table
  if (Array.isArray(state.table) && state.table.length>0) renderTable();

  // action buttons
  renderActionButtons();

  // player hand
  renderPlayerHand();
}

/* render seats for multiplayer */
function renderSeats(){
  if (!state.isMultiplayer || !Array.isArray(state.seats)){ seatsEl.innerHTML=''; return; }
  const you = state.playerId || state.you;
  // order seats so you is first
  let idx = state.seats.findIndex(s=>s.id===you);
  const ordered = idx>=0? [...state.seats.slice(idx), ...state.seats.slice(0,idx)] : [...state.seats];
  seatsEl.innerHTML = ordered.map(seat=>{
    const classes = ['seat']; if (seat.id===you) classes.push('you'); if (seat.id===state.rawAttacker) classes.push('attacker'); if (seat.id===state.rawDefender) classes.push('defender');
    const initials = (String(seat.id||'P').replace(/[^A-Za-zА-Яа-я0-9]/g,'').slice(0,2) || 'P').toUpperCase();
    const badges = [
      seat.id===you? '<span class="badge you">You</span>' : '',
      seat.id===state.rawAttacker? '<span class="badge a">A</span>' : '',
      seat.id===state.rawDefender? '<span class="badge d">D</span>' : ''
    ].join('');
    return `<div class="${classes.join(' ')}"><div class="avatar">${initials}</div><div class="meta"><div class="name">${shortName(seat.id)}</div><div class="info">Карт: ${seat.handCount||0} · ${seat.type||'игрок'}</div></div>${badges}</div>`;
  }).join('');
}
function shortName(id){
  if (!id) return '—';
  if (String(id).startsWith('bot_')) return '🤖 Бот';
  const s = String(id);
  if (/^\d+$/.test(s)) return 'ID '+s.slice(-4);
  return s.length>12? s.slice(0,4)+'…'+s.slice(-4): s;
}

/* opponent area renders compact fan of backs */
function renderOpponentArea(){
  const n = state.isMultiplayer ? (state.opponentCount || 0) : state.botHand.length;
  const section = document.createElement('div'); section.className='opponent-section';
  section.innerHTML = `<h3>${state.isMultiplayer? 'Текущий соперник' : 'Карты бота'}: ${n}</h3>`;
  const row = document.createElement('div'); row.className='opponent-cards';

  const visible = Math.min(n, 12);
  for (let i=0;i<visible;i++){
    const back = document.createElement('div'); back.className='card back'; row.appendChild(back);
  }
  if (n>12){
    const more = document.createElement('div'); more.className='card back more'; more.textContent = `+${n-12}`; row.appendChild(more);
  }
  section.appendChild(row);
  gameBoard.appendChild(section);
}

function renderTable(){
  const sec = document.createElement('div'); sec.className='table-section';
  sec.innerHTML = '<h3>На столе:</h3>';
  const row = document.createElement('div'); row.className='table-cards';
  for (const pair of state.table){
    const wrap = document.createElement('div'); wrap.className='card-pair';
    wrap.appendChild(cardElement(pair.attack,false));
    if (pair.defend) { const d = cardElement(pair.defend,false); d.classList.add('defended'); wrap.appendChild(d); }
    row.appendChild(wrap);
  }
  sec.appendChild(row); gameBoard.appendChild(sec);
}

function renderActionButtons(){
  const actions = document.createElement('div'); actions.className='action-buttons';
  // determine if current player (rawCurrent) equals our id in multiplayer
  const amYou = state.playerId || state.you;
  const amTurn = state.isMultiplayer ? (state.rawCurrent && amYou && state.rawCurrent === amYou) : (state.currentPlayer === 'player');
  // defender take
  if ((state.isMultiplayer ? state.phase==='defending' && state.rawDefender === amYou && amTurn : state.phase==='defending' && state.currentPlayer==='player')){
    const takeBtn = document.createElement('button'); takeBtn.className='danger'; takeBtn.textContent='Взять';
    takeBtn.onclick = ()=> state.isMultiplayer ? sendMove('take') : takeCardsLocal();
    actions.appendChild(takeBtn);
  }
  // pass (bito) - only attacker when table all defended
  const allDefended = state.table.length>0 && state.table.every(p=>p.defend);
  const amAttacker = state.isMultiplayer ? (state.rawAttacker === (state.playerId||state.you)) : (state.attacker === 'player');
  if (allDefended && amAttacker && (state.isMultiplayer ? (state.rawCurrent === (state.playerId||state.you)) : state.currentPlayer==='player')){
    const b = document.createElement('button'); b.className='success'; b.textContent='Бито';
    b.onclick = ()=> state.isMultiplayer ? sendMove('pass') : passTurnLocal();
    actions.appendChild(b);
  }
  if (actions.children.length) gameBoard.appendChild(actions);
}

function renderPlayerHand(){
  const sec = document.createElement('div'); sec.className='hand-section'; sec.innerHTML = '<h3>Ваши карты:</h3>';
  const row = document.createElement('div'); row.className='player-cards';
  const hand = state.playerHand || [];

  // multiplayer role checks
  const amYou = state.playerId || state.you;
  const amTurn = state.isMultiplayer ? (state.rawCurrent && amYou && state.rawCurrent === amYou) : (state.currentPlayer === 'player');
  const amAttacker = state.isMultiplayer ? (state.rawAttacker === amYou) : (state.attacker === 'player');
  const amDefender = state.isMultiplayer ? (state.rawDefender === amYou) : (state.defender === 'player');

  for (let i=0;i<hand.length;i++){
    const card = hand[i];
    const canAttack = (state.isMultiplayer ? (state.phase==='attacking' && amTurn && amAttacker) : (state.phase==='attacking' && state.currentPlayer==='player'));
    const canDefend = (state.isMultiplayer ? (state.phase==='defending' && amTurn && amDefender) : (state.phase==='defending' && state.currentPlayer==='player'));
    const canAdd = (state.isMultiplayer && state.phase==='defending' && !amDefender && state.rawCurrent !== state.playerId); // you can add if not defender
    const clickable = (canAttack && canAttackWithLocal(card)) || (canDefend && canDefendWithLocal(card)) || canAdd && canAddLocal(card);

    const el = cardElement(card, clickable);
    if (clickable){
      el.addEventListener('click', ()=>{
        if (state.isMultiplayer){
          if (canDefend && canDefendWithLocal(card)) sendMove('defend', {rank:card.rank,suit:card.suit});
          else if (canAttack && canAttackWithLocal(card)) sendMove('attack', {rank:card.rank,suit:card.suit});
          else if (canAdd && canAddLocal(card)) sendMove('add', {rank:card.rank,suit:card.suit});
        } else {
          if (canAttack && canAttackWithLocal(card)) attackWithCardBot(i);
          else if (canDefend && canDefendWithLocal(card)) defendWithCardBot(i);
        }
      }, { passive:true });
    }
    row.appendChild(el);
  }
  sec.appendChild(row); gameBoard.appendChild(sec);
}

/* small helpers to test local legality (mirrors server rules) */
function ranksOnTable(){
  const set = new Set();
  for (const p of state.table){ set.add(p.attack.rank); if (p.defend) set.add(p.defend.rank); }
  return set;
}
function defenderCount(){
  if (!state.isMultiplayer) return (state.defender==='player'? state.playerHand.length : state.botHand.length);
  const d = state.seats.find(s=>s.id===state.rawDefender); return d?.handCount ?? 0;
}
function canAttackWithLocal(card){
  if (!card) return false;
  if (state.table.length===0) return state.table.length < defenderCount();
  const ranks = ranksOnTable(); return ranks.has(card.rank) && state.table.length < defenderCount();
}
function canDefendWithLocal(card){
  if (!card || state.table.length===0) return false;
  const last = state.table[state.table.length-1];
  if (!last || last.defend) return false;
  if (card.suit === last.attack.suit && card.value > last.attack.value) return true;
  if (card.suit === state.trumpSuit && last.attack.suit !== state.trumpSuit) return true;
  return false;
}
function canAddLocal(card){
  // during defense, non-defender players may add if rank matches and limit not exceeded
  if (state.phase !== 'defending') return false;
  if (!card) return false;
  if (state.rawDefender === (state.playerId||state.you)) return false;
  const limitOk = state.table.length < defenderCount();
  if (!limitOk) return false;
  return ranksOnTable().has(card.rank);
}

/* card DOM node */
function cardElement(card, clickable){
  const el = document.createElement('div'); el.className = 'card' + (clickable? ' clickable':'') + (card.suit===state.trumpSuit? ' trump':'');
  const suitClass = suitColorClass(card.suit);
  el.innerHTML = `<div style="font-size:12px;opacity:0.8">${card.suit}</div><div style="font-size:18px;font-weight:900">${card.rank}</div>`;
  const suitSpan = document.createElement('div'); suitSpan.className = 'suit ' + suitClass;
  return el;
}

/* status text */
function getStatusText(){
  if (state.isMultiplayer){
    if (state.phase === 'attacking') return (state.rawCurrent === (state.playerId||state.you))? '✅ Ваш ход. Атакуйте!' : '⏳ Ход атакующего…';
    if (state.phase === 'defending'){
      if (state.rawCurrent === (state.playerId||state.you)) return '🛡️ Ваш ход. Защищайтесь!';
      if (state.rawCurrent !== (state.playerId||state.you)) return '♻️ Идёт защита — можете подкидывать';
      return '⏳ Защита...';
    }
    return 'Ожидание...';
  } else {
    if (state.phase === 'attacking') return state.currentPlayer === 'player'? '✅ Ваш ход. Атакуйте!' : '🤖 Бот атакует...';
    if (state.phase === 'defending') return state.currentPlayer === 'player'? '🛡️ Ваш ход. Защищайтесь!' : '🤖 Бот защищается...';
    return 'Ожидание...';
  }
}

/* ---------------- Networking (multiplayer) ---------------- */
const mp = { gameId:null, playerId:null, poll:null };

async function createGame(opts){
  try {
    const r = await fetch('/api/create-game', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
      playerId: tg.initDataUnsafe.user?.id || `user_${Date.now()}`, maxPlayers: opts.maxPlayers, botCount: opts.botCount, autostart: opts.autostart, startWhenFull: opts.startWhenFull
    })});
    const d = await r.json();
    mp.gameId = d.gameId; mp.playerId = d.playerId;
    state.gameId = mp.gameId; state.playerId = mp.playerId;
    // show waiting screen then poll
    gameBoard.innerHTML = `<div style="text-align:center;color:white;padding:12px;"><h2>Комната ${d.gameId}</h2><p>Ожидание игроков...</p><div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #007aff;border-radius:50%;animation:spin 1s linear infinite;margin:8px auto;"></div></div>`;
    mp.poll = setInterval(refreshServer,900);
  } catch(e){ console.error(e); showToast('Ошибка создания комнаты'); }
}

async function joinGame(gameId){
  try {
    const r = await fetch(`/api/join-game/${gameId}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `user_${Date.now()}` }) });
    if (!r.ok) throw new Error(await r.text());
    const d = await r.json();
    mp.gameId = gameId; mp.playerId = d.playerId;
    state.gameId = mp.gameId; state.playerId = mp.playerId;
    gameBoard.innerHTML = `<div style="text-align:center;color:white;padding:12px;"><h2>Присоединились</h2><p>Ожидание начала игры...</p></div>`;
    mp.poll = setInterval(refreshServer,900);
  } catch(e){ console.error(e); showToast('Не удалось присоединиться'); }
}

async function refreshServer(){
  if (!mp.gameId || !mp.playerId) return;
  try {
    const r = await fetch(`/api/game/${mp.gameId}?playerId=${mp.playerId}`);
    if (!r.ok) return;
    const s = await r.json();
    applyServerState(s);
    renderAll();
    if (s.status === 'finished'){ clearInterval(mp.poll); mp.poll = null; }
  } catch(e){ console.warn(e); }
}

function applyServerState(s){
  if (!s) return;
  state.isMultiplayer = true;
  state.seats = s.seats || state.seats;
  state.table = s.table || [];
  state.trumpSuit = s.trumpSuit || state.trumpSuit;
  state.trumpCard = s.trumpCard || state.trumpCard;
  state.opponentCount = (s.seats?.find(x=>x.id === (s.attacker === (state.playerId||state.you) ? s.defender : s.attacker))?.handCount) || 0;
  state.rawAttacker = s.attacker || null;
  state.rawDefender = s.defender || null;
  state.rawCurrent = s.currentPlayer || null;
  state.phase = s.phase || state.phase;
  state.status = s.status || state.status;
  state.you = s.you || state.playerId;
  // get our hand (server returns `hand` for current player)
  state.playerHand = s.hand || state.playerHand || [];
  state.playerId = state.playerId || s.you; // ensure known
}

/* send moves */
async function sendMove(action, card){
  if (!mp.gameId || !mp.playerId) { showToast('Не подключены к комнате'); return; }
  try {
    const r = await fetch(`/api/game/${mp.gameId}/move`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ playerId: mp.playerId, action, card })});
    const data = await r.json();
    if (!r.ok) showToast(data.error || 'Ошибка хода');
    // server will be polled and update UI; optionally call refreshServer immediately
    setTimeout(refreshServer, 300);
  } catch(e){ showToast('Ошибка сети'); }
}

/* helpers for local bot-only legality (same as above but reused) */
/* ... already defined earlier ... */

/* start */
initInterface();

/* If page has mode=join&gameId=... auto trigger join */
(function autoJoinFromUrl(){
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode');
  if (mode==='join' && params.get('gameId')){
    const gid = params.get('gameId');
    joinGame(gid);
  }
})();
