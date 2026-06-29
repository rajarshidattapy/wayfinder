import { createRoot } from 'react-dom/client';
import '../popup/index.css';
import Panel from './Panel';

createRoot(document.getElementById('root')!).render(<Panel />);
