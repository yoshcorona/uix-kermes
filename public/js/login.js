const form = document.getElementById('loginForm');
const errorMsg = document.getElementById('errorMsg');

if (localStorage.getItem('uix_participant')) {
  location.replace('/score');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';

  const firstName = form.firstName.value.trim();
  const lastName  = form.lastName.value.trim();
  if (!firstName || !lastName) {
    errorMsg.textContent = 'Nombre y apellido son requeridos';
    return;
  }

  const btn = form.querySelector('button');
  btn.disabled = true;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al ingresar');

    localStorage.setItem('uix_participant', JSON.stringify(data.participant));
    location.href = '/score';
  } catch (err) {
    errorMsg.textContent = err.message;
    btn.disabled = false;
  }
});
