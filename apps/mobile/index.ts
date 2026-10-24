// Registra a tarefa de rastreio antes de tudo: o Android pode abrir o app só para ela, em segundo plano.
import './src/lib/rastreio';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
