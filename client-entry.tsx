import './src/styles/messageNotation.css';
import { createMessageNotation } from './src/messageNotation';

const messageNotation = createMessageNotation();

const activate = (): void => {
  messageNotation.mount();
};

const deactivate = (): void => {
  messageNotation.unmount();
};

window.pluginActivators = window.pluginActivators ?? {};
window.pluginActivators['growi-plugin-message-notation'] = { activate, deactivate };
