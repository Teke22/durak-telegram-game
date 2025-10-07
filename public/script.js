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
// ... (локальный бот код без изменений) ...
// Для экономии места — оставляем оригинальную реализацию из вашей рабочей версии.
// Ниже важный фрагмент — методы мультиплеера, которые изменены для использования roundMax.

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

  // opponent visualization:
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

  // ВАЖНО: используем s.roundMax если он задан (фиксированный лимит раунда), иначе fallback на handCount
  function defenderHandCount(){
    if (typeof s.roundMax === 'number' && s.roundMax > 0) return s.roundMax;
    const d = (s.seats||[]).find(x=>x.id===s.defender); return d ? d.handCount : 0;
  }

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
document.getElementById('start-game').addEventListener('click', ()=> {
  // запускаем локальную игру (ваш рабочий код)
  // ...
  // для краткости — предполагается, что локальная реализация осталась без изменений
  // если нужно — я пришлю полный локальный код отдельно
  location.href = '?mode=bot';
});
document.getElementById('create-room').addEventListener('click', createRoom);
document.getElementById('join-room').addEventListener('click', joinRoomPrompt);

/* If URL contains mode=join&gameId=... auto-join */
(function autoJoin(){
  const p = new URLSearchParams(location.search);
  if (p.get('mode') === 'join' && p.get('gameId')) {
    const g = p.get('gameId');
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
