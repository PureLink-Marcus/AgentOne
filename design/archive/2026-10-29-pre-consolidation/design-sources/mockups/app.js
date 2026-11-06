const params = new URLSearchParams(location.search);
const initial = params.get('screen') || 'galaxy';
const buttons = [...document.querySelectorAll('[data-screen]')];
const panels = [...document.querySelectorAll('[data-screen-panel]')];

function showScreen(name) {
  buttons.forEach((button) => button.classList.toggle('active', button.dataset.screen === name));
  panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.screenPanel === name));
  const url = new URL(location.href);
  url.searchParams.set('screen', name);
  history.replaceState({}, '', url);
}

buttons.forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.screen)));
showScreen(initial);

const pixelField = document.getElementById('pixels');
if (pixelField) {
  for (let index = 0; index < 120; index += 1) {
    const pixel = document.createElement('i');
    pixel.className = `pixel${index < 48 ? ' done' : index < 54 ? ' current' : ''}`;
    pixelField.appendChild(pixel);
  }
}
