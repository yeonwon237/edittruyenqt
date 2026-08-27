import React from 'react';
import { createRoot } from 'react-dom/client';
import LilyBetaSync from '../../src/components/workspace/LilyBetaSync';
import '../../src/index.css';
createRoot(document.getElementById('root')).render(<main className="p-8"><h1 className="text-xl mb-5">Kiểm thử Editor Sync — dữ liệu giả</h1><LilyBetaSync projectId="11111111-1111-4111-8111-111111111111" currentChapterId="22222222-2222-4222-8222-000000000001" beforeSync={async () => {}} /></main>);
