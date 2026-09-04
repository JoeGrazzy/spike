export default {
  title: 'SPIKE/Navigation/Back Button',
  parameters: { layout: 'centered' },
};

export const Default = () => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'spike-premium-back';
  button.setAttribute('aria-label', 'Go back to the previous SPIKE page');
  button.innerHTML = '<span class="spike-back-icon" aria-hidden="true">←</span><span class="spike-back-label">Back</span>';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/premium-back.css';
  document.head.append(link);
  return button;
};
