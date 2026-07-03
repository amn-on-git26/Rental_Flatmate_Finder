const state = { token: null, user: null, currentMatchId: null };

const authActions = document.getElementById('auth-actions');
const authSection = document.getElementById('auth-section');
const tenantSection = document.getElementById('tenant-section');
const ownerSection = document.getElementById('owner-section');
const adminSection = document.getElementById('admin-section');
const chatSection = document.getElementById('chat-section');

const setSections = () => {
  authSection.classList.toggle('hidden', !!state.user);
  tenantSection.classList.toggle('hidden', !(state.user?.role === 'tenant'));
  ownerSection.classList.toggle('hidden', !(state.user?.role === 'owner'));
  adminSection.classList.toggle('hidden', !(state.user?.role === 'admin'));
  chatSection.classList.toggle('hidden', !state.currentMatchId);
};

const setAuthActions = () => {
  authActions.innerHTML = state.user ? `<span>Hi ${state.user.name} (${state.user.role})</span> <button id="logoutBtn" class="secondary">Logout</button>` : '';
  if (state.user) document.getElementById('logoutBtn').addEventListener('click', logout);
};

const logout = () => {
  state.token = null;
  state.user = null;
  state.currentMatchId = null;
  localStorage.removeItem('rental_token');
  localStorage.removeItem('rental_user');
  render();
};

const api = async (path, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers });
  return res.json();
};

const init = () => {
  const token = localStorage.getItem('rental_token');
  const user = localStorage.getItem('rental_user');
  if (token && user) {
    state.token = token;
    state.user = JSON.parse(user);
  }
  render();
};

const render = () => {
  setAuthActions();
  authSection.innerHTML = state.user ? `<p>Welcome back. Use the panels below.</p>` : authMarkup();
  tenantSection.innerHTML = state.user?.role === 'tenant' ? tenantMarkup() : '';
  ownerSection.innerHTML = state.user?.role === 'owner' ? ownerMarkup() : '';
  adminSection.innerHTML = state.user?.role === 'admin' ? adminMarkup() : '';
  chatSection.innerHTML = state.currentMatchId ? chatMarkup() : '';
  setSections();
  attachHandlers();
};

const authMarkup = () => `
  <h2>Login or Register</h2>
  <div class="panel">
    <h3>Register</h3>
    <label>Name</label><input id="regName" />
    <label>Email</label><input id="regEmail" />
    <label>Password</label><input type="password" id="regPassword" />
    <label>Role</label><select id="regRole"><option value="tenant">Tenant</option><option value="owner">Owner</option></select>
    <button id="registerBtn">Register</button>
  </div>
  <div class="panel">
    <h3>Login</h3>
    <label>Email</label><input id="loginEmail" />
    <label>Password</label><input type="password" id="loginPassword" />
    <button id="loginBtn">Login</button>
  </div>
`;

const tenantMarkup = () => `
  <h2>Tenant Dashboard</h2>
  <div class="panel">
    <h3>Profile</h3>
    <label>Preferred location</label><input id="profileLocation" />
    <label>Budget min</label><input id="profileBudgetMin" type="number" />
    <label>Budget max</label><input id="profileBudgetMax" type="number" />
    <label>Move-in date</label><input id="profileMoveIn" type="date" />
    <button id="saveProfileBtn">Save Profile</button>
  </div>
  <div class="panel">
    <h3>Search Listings</h3>
    <label>Location filter</label><input id="searchLocation" />
    <label>Min rent</label><input id="searchMinRent" type="number" />
    <label>Max rent</label><input id="searchMaxRent" type="number" />
    <button id="searchListingsBtn">Search</button>
    <div id="listingsContainer"></div>
  </div>
  <div class="panel">
    <h3>Your Matches</h3>
    <div id="tenantMatches"></div>
  </div>
`;

const ownerMarkup = () => `
  <h2>Owner Dashboard</h2>
  <div class="panel">
    <h3>Create Listing</h3>
    <label>Title</label><input id="listingTitle" />
    <label>Location</label><input id="listingLocation" />
    <label>Rent</label><input id="listingRent" type="number" />
    <label>Available from</label><input id="listingAvailable" type="date" />
    <label>Room type</label><input id="listingRoomType" />
    <label>Furnishing</label><input id="listingFurnishing" />
    <button id="createListingBtn">Create Listing</button>
  </div>
  <div class="panel">
    <h3>Matches</h3>
    <div id="ownerMatches"></div>
  </div>
`;

const adminMarkup = () => `
  <h2>Admin Dashboard</h2>
  <div class="panel"><h3>Users</h3><div id="adminUsers"></div></div>
  <div class="panel"><h3>Listings</h3><div id="adminListings"></div></div>
  <div class="panel"><h3>Activity</h3><div id="adminActivity"></div></div>
`;

const chatMarkup = () => `
  <h2>Chat</h2>
  <div class="panel">
    <div id="messagesList"></div>
    <textarea id="chatText" rows="3"></textarea>
    <button id="sendChatBtn">Send</button>
    <button id="closeChatBtn" class="secondary small">Close Chat</button>
  </div>
`;

const attachHandlers = () => {
  document.getElementById('registerBtn')?.addEventListener('click', register);
  document.getElementById('loginBtn')?.addEventListener('click', login);
  document.getElementById('saveProfileBtn')?.addEventListener('click', saveProfile);
  document.getElementById('searchListingsBtn')?.addEventListener('click', searchListings);
  document.getElementById('createListingBtn')?.addEventListener('click', createListing);
  document.getElementById('sendChatBtn')?.addEventListener('click', sendChat);
  document.getElementById('closeChatBtn')?.addEventListener('click', () => { state.currentMatchId = null; render(); });
  loadDashboard();
};

const register = async () => {
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  const role = document.getElementById('regRole').value;
  const response = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
  if (response.token) {
    state.token = response.token;
    state.user = response.user;
    localStorage.setItem('rental_token', state.token);
    localStorage.setItem('rental_user', JSON.stringify(state.user));
    render();
  }
};

const login = async () => {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const response = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (response.token) {
    state.token = response.token;
    state.user = response.user;
    localStorage.setItem('rental_token', state.token);
    localStorage.setItem('rental_user', JSON.stringify(state.user));
    render();
  }
};

const saveProfile = async () => {
  const preferred_location = document.getElementById('profileLocation').value;
  const budget_min = Number(document.getElementById('profileBudgetMin').value);
  const budget_max = Number(document.getElementById('profileBudgetMax').value);
  const move_in_date = document.getElementById('profileMoveIn').value;
  await api('/api/profile', { method: 'POST', body: JSON.stringify({ preferred_location, budget_min, budget_max, move_in_date }) });
  alert('Profile saved');
};

const searchListings = async () => {
  const location = document.getElementById('searchLocation').value;
  const minRent = document.getElementById('searchMinRent').value;
  const maxRent = document.getElementById('searchMaxRent').value;
  const response = await api(`/api/listings?location=${encodeURIComponent(location)}&minRent=${minRent}&maxRent=${maxRent}`);
  const container = document.getElementById('listingsContainer');
  container.innerHTML = response.listings?.map((listing) => `
    <div class="listing-card">
      <strong>${listing.title}</strong><p>${listing.location} · ₹${listing.rent}</p>
      <p>Score: ${listing.compatibility.score}</p>
      <p>${listing.compatibility.explanation}</p>
      <button data-id="${listing.id}" class="interestBtn">Send Interest</button>
    </div>
  `).join('') || '<p>No listings found</p>';
  container.querySelectorAll('.interestBtn').forEach((button) => {
    button.addEventListener('click', () => expressInterest(button.dataset.id));
  });
};

const loadDashboard = async () => {
  if (!state.user) return;
  if (state.user.role === 'tenant') {
    const profile = await api('/api/profile');
    if (profile.profile) {
      document.getElementById('profileLocation').value = profile.profile.preferred_location || '';
      document.getElementById('profileBudgetMin').value = profile.profile.budget_min || '';
      document.getElementById('profileBudgetMax').value = profile.profile.budget_max || '';
      document.getElementById('profileMoveIn').value = profile.profile.move_in_date || '';
    }
    const matches = await api('/api/matches');
    document.getElementById('tenantMatches').innerHTML = matches.matches?.map((match) => `
      <div class="match-card">
        <strong>${match.title}</strong>
        <p>Status: ${match.status} · Score: ${match.score}</p>
        <button data-id="${match.id}" class="openChatBtn" ${match.status === 'accepted' ? '' : 'disabled'}>Open Chat</button>
      </div>
    `).join('') || '<p>No matches yet</p>';
    document.querySelectorAll('.openChatBtn').forEach((button) => button.addEventListener('click', () => openChat(button.dataset.id)));
  }
  if (state.user.role === 'owner') {
    const matches = await api('/api/matches');
    document.getElementById('ownerMatches').innerHTML = matches.matches?.map((match) => `
      <div class="match-card">
        <strong>${match.title}</strong>
        <p>Tenant: ${match.tenant_name} · Status: ${match.status}</p>
        <button data-id="${match.id}" class="respondBtn" ${match.status !== 'pending' ? 'disabled' : ''}>Accept</button>
        <button data-id="${match.id}" class="declineBtn" ${match.status !== 'pending' ? 'disabled' : ''}>Decline</button>
      </div>
    `).join('') || '<p>No matches yet</p>';
    document.querySelectorAll('.respondBtn').forEach((button) => button.addEventListener('click', () => respondMatch(button.dataset.id, 'accepted')));
    document.querySelectorAll('.declineBtn').forEach((button) => button.addEventListener('click', () => respondMatch(button.dataset.id, 'declined')));
  }
  if (state.user.role === 'admin') {
    const users = await api('/api/admin/users');
    const listings = await api('/api/admin/listings');
    const activity = await api('/api/admin/activity');
    document.getElementById('adminUsers').innerHTML = users.users?.map((user) => `<div>${user.name} (${user.email}) [${user.role}]</div>`).join('') || '<p>No users</p>';
    document.getElementById('adminListings').innerHTML = listings.listings?.map((listing) => `<div>${listing.title} — ${listing.location} ₹${listing.rent}</div>`).join('') || '<p>No listings</p>';
    document.getElementById('adminActivity').innerHTML = `<p>${activity.matches.length} matches</p><p>${activity.messages.length} messages</p>`;
  }
};

const createListing = async () => {
  const title = document.getElementById('listingTitle').value;
  const location = document.getElementById('listingLocation').value;
  const rent = Number(document.getElementById('listingRent').value);
  const available_from = document.getElementById('listingAvailable').value;
  const room_type = document.getElementById('listingRoomType').value;
  const furnishing = document.getElementById('listingFurnishing').value;
  await api('/api/listings', { method: 'POST', body: JSON.stringify({ title, location, rent, available_from, room_type, furnishing }) });
  alert('Listing created');
  loadDashboard();
};

const expressInterest = async (listingId) => {
  await api(`/api/interest/${listingId}`, { method: 'POST' });
  alert('Interest expressed');
  loadDashboard();
};

const respondMatch = async (matchId, action) => {
  await api(`/api/interest/${matchId}/respond`, { method: 'POST', body: JSON.stringify({ action }) });
  alert(`Match ${action}`);
  loadDashboard();
};

let socket;
const openChat = async (matchId) => {
  state.currentMatchId = matchId;
  render();
  const messagesRes = await api(`/api/chat/${matchId}/messages`);
  document.getElementById('messagesList').innerHTML = messagesRes.messages?.map((message) => `<div class="message-card"><strong>${message.sender_id}</strong><p>${message.text}</p></div>`).join('') || '<p>No messages</p>';
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${state.token}&matchId=${matchId}`);
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'message') {
      document.getElementById('messagesList').innerHTML += `<div class="message-card"><strong>${data.sender_id}</strong><p>${data.text}</p></div>`;
    }
  });
};

const sendChat = () => {
  const text = document.getElementById('chatText').value;
  if (!socket || socket.readyState !== WebSocket.OPEN) return alert('Chat not connected');
  socket.send(JSON.stringify({ text }));
  document.getElementById('chatText').value = '';
};

init();
