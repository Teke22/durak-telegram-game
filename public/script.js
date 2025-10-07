// public/script.js
const tg = window.Telegram?.WebApp ?? { expand() {}, initDataUnsafe: {}, HapticFeedback:{ impactOccurred(){} }, showPopup(opts){ alert((opts.title?opts.title+"\n":"")+ (opts.message||"")) } };
tg.expand?.();

const API = {
  create: '/api/create-game',
  join: (id) => `/api/join-game/${id}`,
  game: (id) => `/api/game/${id}`,
  move: (id) => `/api/game/${id}/move`
};

const RANK_VALUES = { '6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

const qs = new URLSearchParams(location.search);
let MODE = qs.get('mode') || 'bot';

const el = {
  seats: document.getElementById('seats'),
  board: document.getElementById('game-board'),
  startBtn: document.getElementById('start-game'),
  createBtn: document.getElementById('create-room'),
  joinBtn: document.getElementById('join-room'),
  toastContainer: document.getElementById('toast-container')
};

function showToast(text, ms=1400){
  const t = document.createElement('div'); t.className='toast'; t.textContent=text;
  el.toastContainer.appendChild(t);
  setTimeout(()=> t.remove(), ms);
}

/* ---------------- LOCAL BOT (1v1) ---------------- */
let local = {
  deck: [], playerHand: [], botHand: [], table: [], trumpSuit:null, trumpCard:null,
  attacker: 'player', defender:'bot', currentPlayer:'player', phase:'attacking', status:'idle'
};

function buildDeck(){
  const SUITS = ['♠','♥','♦','♣'];
  const RANKS = ['6','7','8','9','10','J','Q','K','A'];
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank:r, suit:s, value:RANK_VALUES[r] });
  for (let i=d.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
  return d;
}

function initLocalGame(){
  local.deck = buildDeck();
  local.trumpCard = local.deck[local.deck.length-1];
  local.trumpSuit = local.trumpCard.suit;
  local.playerHand = []; local.botHand = [];
  for (let i=0;i<6;i++){ if (local.deck.length) local.playerHand.push(local.deck.pop()); if (local.deck.length) local.botHand.push(local.deck.pop()); }
  local.table = []; local.attacker='player'; local.defender='bot'; local.currentPlayer='player'; local.phase='attacking'; local.status='playing';
  renderAllLocal();
}

function renderAllLocal(){
  renderSeatsLocal();
  el.board.innerHTML = '';
  const header = document.createElement('div');
  header.innerHTML = `
    <h2>Играть</h2>
    <div class="table-section"><div>Козырь: <strong>${local.trumpSuit}</strong> (${local.trumpCard.rank}${local.trumpCard.suit})</div><div style="margin-top:6px;">В колоде: ${local.deck.length}</div></div>
    <div class="table-section"><div class="game-status">${getStatusLocal()}</div></div>
  `;
  el.board.appendChild(header);
  renderOpponentLocal();
  if (local.table.length>0) renderTableLocal();
  renderActionButtonsLocal();
  renderPlayerHandLocal();
}

function renderSeatsLocal(){
  el.seats.innerHTML = `<div class="seat you">You</div><div class="seat">Бот</div>`;
}

function renderOpponentLocal(){
  const n = local.botHand.length;
  const sec = document.createElement('div'); sec.className='opponent-section';
  sec.innerHTML = `<h3>Бот: ${n}</h3>`;
  const row = document.createElement('div'); row.className='opponent-cards';
  for (let i=0;i<Math.min(12,n);i++){ const b = document.createElement('div'); b.className='card back'; row.appendChild(b); }
  if (n>12){ const more = document.createElement('div'); more.className='card back more'; more.textContent = `+${n-12}`; row.appendChild(more); }
  sec.appendChild(row);
  el.board.appendChild(sec);
}

function renderTableLocal(){
  const sec = document.createElement('div'); sec.className='table-section'; sec.innerHTML = '<h3>На столе:</h3>';
  const row = document.createElement('div'); row.className='table-cards';
  local.table.forEach(pair => {
    const wrap = document.createElement('div'); wrap.className='card-pair';
    wrap.appendChild(cardNode(pair.attack,false));
    if (pair.defend){ const d = cardNode(pair.defend,false); d.classList.add('defended'); wrap.appendChild(d); }
    row.appendChild(wrap);
  });
  sec.appendChild(row); el.board.appendChild(sec);
}

function renderActionButtonsLocal(){
  const actions = document.createElement('div'); actions.className='action-buttons';
  const allDef = local.table.length>0 && local.table.every(p=>p.defend);
  if (local.phase==='defending' && local.currentPlayer==='player'){
    const take = document.createElement('button'); take.className='danger'; take.textContent='Взять';
    take.onclick = takeCardsLocal; actions.appendChild(take);
  }
  if (allDef && local.currentPlayer==='player' && local.attacker==='player'){
    const b = document.createElement('button'); b.className='success'; b.textContent='Бито';
    b.onclick = ()=>{ passLocal(); }; actions.appendChild(b);
  }
  if (actions.children.length) el.board.appendChild(actions);
}

function renderPlayerHandLocal(){
  const sec = document.createElement('div'); sec.className='hand-section'; sec.innerHTML='<h3>Ваши карты:</h3>';
  const row = document.createElement('div'); row.className='player-cards';
  local.playerHand.forEach((card, idx) => {
    const canAttack = local.phase==='attacking' && local.currentPlayer==='player' && local.attacker==='player';
    const canDefend = local.phase==='defending' && local.currentPlayer==='player' && local.defender==='player';
    const clickable = (canAttack && canAttackLocal(card)) || (canDefend && canDefendLocal(card));
    const n = cardNode(card, clickable);
    if (clickable) n.addEventListener('click', ()=>{
      if (canAttack && canAttackLocal(card)) attackLocal(idx);
      else if (canDefend && canDefendLocal(card)) defendLocal(idx);
    });
    row.appendChild(n);
  });
  sec.appendChild(row); el.board.appendChild(sec);
}

function cardNode(card, clickable){
  const d = document.createElement('div'); d.className='card' + (clickable? ' clickable' : '');
  const suitClass = (card.suit === '♥' || card.suit === '♦') ? 'suit red' : 'suit black';
  d.innerHTML = `<div class="${suitClass}">${card.suit}</div><div style="font-size:18px">${card.rank}</div>`;
  return d;
}

function canAttackLocal(card){
  if (local.table.length === 0) return true;
  const ranks = new Set(); local.table.forEach(p=>{ ranks.add(p.attack.rank); if (p.defend) ranks.add(p.defend.rank); });
  return ranks.has(card.rank) && local.table.length < (local.defender==='player'? local.playerHand.length : local.botHand.length);
}
function canDefendLocal(card){
  if (local.table.length===0) return false;
  const last = local.table[local.table.length-1];
  if (!last || last.defend) return false;
  if (card.suit === last.attack.suit && card.value > last.attack.value) return true;
  if (card.suit === local.trumpSuit && last.attack.suit !== local.trumpSuit) return true;
  return false;
}

function attackLocal(index){
  const played = local.playerHand.splice(index,1)[0];
  local.table.push({ attack: played, defend: null });
  local.phase='defending'; local.currentPlayer='bot';
  renderAllLocal();
  setTimeout(botMoveLocal, 500);
}
function defendLocal(index){
  const last = local.table[local.table.length-1];
  if (!last || last.defend) return;
  const played = local.playerHand.splice(index,1)[0];
  last.defend = played;
  // if all defended, attacker can add or pass
  const allDef = local.table.every(p => p.defend);
  if (allDef){
    // attacker becomes defender, etc. We'll mark bito following bot logic
    local.phase='attacking'; local.currentPlayer = local.attacker;
    // but local attacker is player (in this branch), we allow player to press "Бито"
    renderAllLocal();
  } else {
    local.currentPlayer = 'bot';
    renderAllLocal();
    setTimeout(botMoveLocal, 400);
  }
}

function takeCardsLocal(){
  for (const p of local.table){ local.playerHand.push(p.attack); if (p.defend) local.playerHand.push(p.defend); }
  local.table = [];
  refillLocal(true);
  showToast('Вы взяли карты', 1000);
}

function passLocal(){
  // бито — очищаем и перкручиваем роли
  local.table = [];
  refillLocal(false);
  showToast('Вы: бито', 900);
}

function refillLocal(defenderTook){
  // draw to 6, attacker-first
  const drawOne = (hand) => { if (local.deck.length) hand.push(local.deck.pop()); };
  const first = local.attacker === 'player' ? local.playerHand : local.botHand;
  const second = local.defender === 'player' ? local.playerHand : local.botHand;
  while ((first.length < 6 || second.length < 6) && local.deck.length){
    if (first.length < 6) drawOne(first);
    if (second.length < 6) drawOne(second);
  }
  if (!defenderTook){
    const prevAtt = local.attacker;
    local.attacker = local.defender;
    local.defender = prevAtt;
  }
  local.phase='attacking'; local.currentPlayer = local.attacker;
  renderAllLocal();
  if (local.currentPlayer === 'bot') setTimeout(botMoveLocal, 400);
}

function botMoveLocal(){
  // simplified bot behavior (see earlier long code): if defending choose smallest defender, else attack smallest
  if (local.phase === 'attacking'){
    if (local.table.length === 0){
      if (local.botHand.length === 0){ passLocal(); return; }
      // choose smallest by value (prefer non-trump)
      let best = 0, bestVal = Infinity;
      for (let i=0;i<local.botHand.length;i++){
        const c = local.botHand[i]; const v = (c.suit === local.trumpSuit ? 100 + c.value : c.value);
        if (v < bestVal){ bestVal = v; best = i; }
      }
      const card = local.botHand.splice(best,1)[0];
      local.table.push({ attack: card, defend: null });
      local.phase='defending'; local.currentPlayer='player';
      showToast('Бот атакует', 700);
      renderAllLocal();
      return;
    } else {
      // maybe add
      const ranks = new Set(); local.table.forEach(p=>{ ranks.add(p.attack.rank); if (p.defend) ranks.add(p.defend.rank); });
      if (local.table.length < (local.defender==='player'? local.playerHand.length : local.botHand.length)){
        for (let i=0;i<local.botHand.length;i++){
          if (ranks.has(local.botHand[i].rank)){
            const card = local.botHand.splice(i,1)[0];
            local.table.push({ attack: card, defend: null });
            local.phase='defending'; local.currentPlayer='player';
            renderAllLocal();
            return;
          }
        }
      }
      passLocal();
      return;
    }
  } else if (local.phase === 'defending'){
    const last = local.table[local.table.length-1];
    if (!last || last.defend) { local.phase='attacking'; local.currentPlayer = local.attacker; renderAllLocal(); return; }
    // find defend
    let idx = -1;
    for (let i=0;i<local.botHand.length;i++){
      const c = local.botHand[i];
      if (c.suit === last.attack.suit && c.value > last.attack.value){ idx = i; break; }
      if (c.suit === local.trumpSuit && last.attack.suit !== local.trumpSuit){ idx = i; break; }
    }
    if (idx === -1){
      // take
      for (const p of local.table){ local.botHand.push(p.attack); if (p.defend) local.botHand.push(p.defend); }
      local.table = [];
      refillLocal(true);
      showToast('Бот взял карты', 900);
      return;
    } else {
      const c = local.botHand.splice(idx,1)[0];
      last.defend = c;
      const all = local.table.every(p=>p.defend);
      if (all){
        showToast('Бот отбился', 700);
        refillLocal(false);
      } else {
        // continue
        local.phase='attacking'; local.currentPlayer = local.attacker;
        renderAllLocal();
      }
      return;
    }
  }
}

function getStatusLocal(){
  if (local.phase === 'attacking') return local.currentPlayer === 'player' ? '✅ Ваш ход. Атакуйте!' : '🤖 Бот атакует...';
  if (local.phase === 'defending') return local.currentPlayer === 'player' ? '🛡️ Ваш ход. Защищайтесь!' : '🤖 Бот защищается...';
  return '';
}

/* ---------------- MULTIPLAYER (2 players) ---------------- */
let mp = { gameId: null, playerId: null, poll: null, state: null };

async function createRoom(){
  try {
    const resp = await fetch(API.create, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `player_${Date.now()}` }) });
    const d = await resp.json();
    mp.gameId = d.gameId; mp.playerId = d.playerId;
    showToast(`Комната ${d.gameId} создана`, 900);
    startPolling();
    el.board.innerHTML = `<div style="text-align:center;color:white"><h2>Комната ${d.gameId}</h2><p>Ожидание второго игрока...</p></div>`;
  } catch(e){
    console.error(e); showToast('Не удалось создать комнату');
  }
}

async function joinRoomPrompt(){
  const code = prompt('Введите код комнаты (6 символов)').toUpperCase().trim();
  if (!code || code.length !== 6) return showToast('Некорректный код');
  try {
    const resp = await fetch(API.join(code), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `player_${Date.now()}` }) });
    if (!resp.ok) { const t = await resp.text(); throw new Error(t); }
    const d = await resp.json();
    mp.gameId = d.gameId; mp.playerId = d.playerId;
    showToast(`Присоединились к ${d.gameId}`, 900);
    startPolling();
    el.board.innerHTML = `<div style="text-align:center;color:white"><h2>Комната ${d.gameId}</h2><p>Ожидание старта...</p></div>`;
  } catch(e){
    console.error(e); showToast('Не удалось присоединиться');
  }
}

function startPolling(){
  if (mp.poll) clearInterval(mp.poll);
  mp.poll = setInterval(refreshGame, 900);
  refreshGame();
}

async function refreshGame(){
  if (!mp.gameId || !mp.playerId) return;
  try {
    const r = await fetch(API.game(mp.gameId) + `?playerId=${encodeURIComponent(mp.playerId)}`);
    if (!r.ok) return;
    const s = await r.json();
    mp.state = s;
    renderMPFromState(s);
    if (s.status === 'finished' && mp.poll){ clearInterval(mp.poll); mp.poll = null; }
  } catch(e){
    // ignore transient
    // console.error(e);
  }
}

function renderMPFromState(s){
  // seats
  el.seats.innerHTML = (s.seats || []).map(st => `<div class="seat ${st.id === s.you ? 'you' : ''}">${st.id === s.you ? 'You' : 'Player'}<div style="font-weight:normal;font-size:12px">Карт: ${st.handCount||0}</div></div>`).join('');

  el.board.innerHTML = '';
  const header = document.createElement('div');
  header.innerHTML = `
    <h2>Комната ${s.id}</h2>
    <div class="table-section"><div>Козырь: <strong>${s.trumpSuit || '—'}</strong></div><div style="margin-top:6px;">В колоде: ${s.deckCount}</div></div>
    <div class="table-section"><div class="game-status">${getStatusMP(s)}</div></div>
  `;
  el.board.appendChild(header);

  // opponent visualization: find opponent relative to you (attacker/defender)
  const you = s.you;
  const opponentId = (s.attacker === you ? s.defender : (s.defender === you ? s.attacker : (s.seats && s.seats[0] ? s.seats[0].id : null)));
  const opponentSeat = (s.seats||[]).find(x => x.id === opponentId);
  const oppCount = opponentSeat ? opponentSeat.handCount : 0;
  const sec = document.createElement('div'); sec.className='opponent-section'; sec.innerHTML = `<h3>Оппонент: ${oppCount}</h3>`;
  const row = document.createElement('div'); row.className='opponent-cards';
  for (let i=0;i<Math.min(12, oppCount);i++){ const b = document.createElement('div'); b.className='card back'; row.appendChild(b); }
  if (oppCount > 12){ const more = document.createElement('div'); more.className='card back more'; more.textContent = `+${oppCount-12}`; row.appendChild(more); }
  sec.appendChild(row);
  el.board.appendChild(sec);

  // table
  if (s.table && s.table.length) {
    const tsec = document.createElement('div'); tsec.className='table-section'; tsec.innerHTML = '<h3>На столе:</h3>';
    const tro = document.createElement('div'); tro.className='table-cards';
    s.table.forEach(pair => {
      const wrap = document.createElement('div'); wrap.className='card-pair';
      wrap.appendChild(cardNodeFromObj(pair.attack, false));
      if (pair.defend){ const d = cardNodeFromObj(pair.defend, false); d.classList.add('defended'); wrap.appendChild(d); }
      tro.appendChild(wrap);
    });
    tsec.appendChild(tro); el.board.appendChild(tsec);
  }

  // actions and player's hand (server provides hand for current player in response)
  const hand = s.hand || [];
  renderMPActionButtons(s);
  renderMPPlayerHand(s, hand);
}

function getStatusMP(s){
  if (!s) return '';
  if (s.phase === 'attacking'){
    return s.currentPlayer === s.you ? '✅ Ваш ход. Атакуйте!' : '⏳ Ход атакующего...';
  }
  if (s.phase === 'defending'){
    if (s.currentPlayer === s.you) return '🛡️ Ваш ход. Защищайтесь!';
    return '♻️ Идёт защита — атакующий может подкидывать';
  }
  return '';
}

function renderMPActionButtons(s){
  const actions = document.createElement('div'); actions.className='action-buttons';
  const you = s.you;
  const isDefender = s.defender === you;
  const isAttacker = s.attacker === you;
  const isCurrent = s.currentPlayer === you;

  const allDef = s.table && s.table.length>0 && s.table.every(p => p.defend);

  if (s.phase === 'defending' && isDefender && isCurrent){
    const take = document.createElement('button'); take.className='danger'; take.textContent='Взять';
    take.onclick = ()=> sendMoveMP('take', null);
    actions.appendChild(take);
  }
  if (allDef && isAttacker && isCurrent && s.phase === 'attacking'){
    const pass = document.createElement('button'); pass.className='success'; pass.textContent='Бито';
    pass.onclick = ()=> sendMoveMP('pass', null);
    actions.appendChild(pass);
  }
  if (actions.children.length) el.board.appendChild(actions);
}

function renderMPPlayerHand(s, hand){
  const sec = document.createElement('div'); sec.className='hand-section'; sec.innerHTML = '<h3>Ваши карты:</h3>';
  const row = document.createElement('div'); row.className='player-cards';
  const you = s.you;
  const isAttacker = s.attacker === you;
  const isDefender = s.defender === you;
  const isCurrent = s.currentPlayer === you;

  function defenderHandCount(){ const d = (s.seats||[]).find(x=>x.id===s.defender); return d ? d.handCount : 0; }

  for (const card of hand){
    const canAttack = (s.phase === 'attacking' && isCurrent && isAttacker);
    const canDefend = (s.phase === 'defending' && isCurrent && isDefender);
    const canAdd = (s.phase === 'defending' && !isDefender && isCurrent && isAttacker); // in 2p only attacker can add
    const clickable = (canAttack && canAttackWithMP(card, s, defenderHandCount())) || (canDefend && canDefendWithMP(card, s)) || (canAdd && canAddWithMP(card, s, defenderHandCount()));
    const node = cardNodeFromObj(card, clickable);
    if (clickable){
      node.addEventListener('click', ()=>{
        if (canDefend && canDefendWithMP(card, s)) sendMoveMP('defend', { rank: card.rank, suit: card.suit });
        else if (canAttack && canAttackWithMP(card, s, defenderHandCount())) sendMoveMP('attack', { rank: card.rank, suit: card.suit });
        else if (canAdd && canAddWithMP(card, s, defenderHandCount())) sendMoveMP('add', { rank: card.rank, suit: card.suit });
      }, { passive:true });
    }
    row.appendChild(node);
  }
  sec.appendChild(row); el.board.appendChild(sec);
}

function canAttackWithMP(card, s, defenderHandCount){
  if (!card) return false;
  if ((s.table||[]).length === 0) return ((s.table||[]).length < defenderHandCount);
  const rset = new Set(); (s.table||[]).forEach(p=>{ rset.add(p.attack.rank); if (p.defend) rset.add(p.defend.rank); });
  return rset.has(card.rank) && (s.table||[]).length < defenderHandCount;
}
function canDefendWithMP(card, s){
  if (!card) return false;
  if (!s.table || s.table.length === 0) return false;
  const last = s.table[s.table.length - 1];
  if (!last || last.defend) return false;
  if (card.suit === last.attack.suit && RANK_VALUES[card.rank] > RANK_VALUES[last.attack.rank]) return true;
  if (card.suit === s.trumpSuit && last.attack.suit !== s.trumpSuit) return true;
  return false;
}
function canAddWithMP(card, s, defenderHandCount){
  // in 2p only attacker can add while defender is defending
  if (!card) return false;
  if (!s.table || s.table.length === 0) return false;
  if (s.table.length >= defenderHandCount) return false;
  const rset = new Set(); (s.table||[]).forEach(p=>{ rset.add(p.attack.rank); if (p.defend) rset.add(p.defend.rank); });
  return rset.has(card.rank);
}

function cardNodeFromObj(card, clickable){
  const d = document.createElement('div'); d.className = 'card' + (clickable ? ' clickable' : '');
  const suitClass = (card.suit === '♥' || card.suit === '♦') ? 'suit red' : 'suit black';
  d.innerHTML = `<div class="${suitClass}">${card.suit}</div><div style="font-size:18px">${card.rank}</div>`;
  return d;
}

async function sendMoveMP(action, card){
  if (!mp.gameId || !mp.playerId) return showToast('Не в комнате');
  try {
    const r = await fetch(`/api/game/${mp.gameId}/move`, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ playerId: mp.playerId, action, card })
    });
    const data = await r.json();
    if (!r.ok) { showToast(data?.error || 'Ошибка хода'); return; }
    // refresh quickly
    setTimeout(refreshGame, 200);
  } catch(e){
    showToast('Ошибка сети');
  }
}

/* ---------------- UI hookup ---------------- */
el.startBtn.addEventListener('click', ()=> {
  MODE = 'bot';
  initLocalGame();
});
el.createBtn.addEventListener('click', createRoom);
el.joinBtn.addEventListener('click', joinRoomPrompt);

/* If URL contains mode=join&gameId=... auto-join */
(function autoJoin(){
  const p = new URLSearchParams(location.search);
  if (p.get('mode') === 'join' && p.get('gameId')) {
    const g = p.get('gameId');
    // attempt to join
    (async ()=> {
      try {
        const resp = await fetch(`/api/join-game/${g}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `player_${Date.now()}` }) });
        if (!resp.ok) throw new Error('join failed');
        const d = await resp.json();
        mp.gameId = d.gameId; mp.playerId = d.playerId;
        startPolling();
      } catch(e){ console.warn('auto join failed', e); }
    })();
  }
})();

