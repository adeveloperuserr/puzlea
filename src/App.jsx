import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowLeft, BadgeCheck, Check, Clock3, Eye, EyeOff, FolderOpen,
  ImagePlus, LockKeyhole, LogOut, Printer, Puzzle, RotateCw, ShieldCheck, Sparkles,
  Trash2, Upload, UserRound, X,
} from 'lucide-react';
import PuzzleStage from './game/PuzzleStage';
import { createPuzzle } from './game/geometry';
import { prepareImage } from './lib/image';
import { deletePuzzle, getPuzzle, listPuzzles, savePuzzle } from './lib/puzzleStore';
import { supabaseConfigured } from './lib/supabaseConfig';
import './styles/base.css';

const LEVELS = [
  { count: 24, title: 'Paseo', detail: 'Para empezar' },
  { count: 48, title: 'Un rato', detail: 'Ritmo tranquilo' },
  { count: 96, title: 'Desafío', detail: 'Concentración' },
  { count: 192, title: 'A fondo', detail: 'Pieza a pieza' },
];

function useObjectUrl(blob) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return undefined;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(timestamp));
}

function Brand() {
  return (
    <a className="brand" href="#inicio" aria-label="Puzlea, inicio">
      <span className="brand-mark"><Puzzle size={21} strokeWidth={2.3} /></span>
      <span>puzlea<span className="brand-period">.</span></span>
    </a>
  );
}

function Header({ page, setPage, user, onSignOut, onAccount }) {
  return (
    <header className="topbar">
      <Brand />
      <nav className="main-nav" aria-label="Navegación principal">
        <button className={page === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => setPage('home')}>Crear</button>
        <button className={page === 'gallery' ? 'nav-link active' : 'nav-link'} onClick={() => setPage('gallery')}>Galería</button>
      </nav>
      <div className="topbar-actions">
        {user ? (
          <button className="account-button" onClick={onSignOut} title="Cerrar sesión"><UserRound size={17} /><span>{user.email}</span><LogOut size={15} /></button>
        ) : (
          <button className="quiet-button" onClick={onAccount}><UserRound size={17} /><span>Iniciar sesión</span></button>
        )}
      </div>
    </header>
  );
}

function DifficultyPicker({ value, onChange }) {
  return (
    <fieldset className="difficulty-fieldset">
      <legend>¿Cuántas piezas?</legend>
      <div className="difficulty-options">
        {LEVELS.map((level) => (
          <button
            key={level.count}
            type="button"
            className={`difficulty-option${value === level.count ? ' chosen' : ''}`}
            aria-pressed={value === level.count}
            onClick={() => onChange(level.count)}
          >
            <span className="difficulty-count">{level.count}</span>
            <span className="difficulty-name">{level.title}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ImageDrop({ image, busy, onFile, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  async function takeFile(file) {
    if (file) await onFile(file);
  }
  return (
    <div
      className={`image-drop${image ? ' has-image' : ''}${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void takeFile(event.dataTransfer.files?.[0]); }}
    >
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => { void takeFile(event.target.files?.[0]); event.target.value = ''; }}
        aria-label="Elige una imagen para tu rompecabezas"
      />
      {image ? (
        <>
          <img className="upload-preview" src={image.url} alt="Vista previa de la imagen elegida" />
          <div className="upload-overlay">
            <span className="image-ready"><Check size={15} /> Imagen lista</span>
            <button type="button" className="small-light-button" onClick={() => inputRef.current?.click()}>Cambiar imagen</button>
          </div>
          <span className="image-name" title={image.name}>{image.name}</span>
        </>
      ) : (
        <>
          <div className="drop-art" aria-hidden="true">
            <div className="mini-piece piece-a" /><div className="mini-piece piece-b" />
            <div className="mini-piece piece-c" /><div className="mini-piece piece-d" />
            <span className="drop-art-icon"><ImagePlus size={23} /></span>
          </div>
          <h3>Empieza con una imagen</h3>
          <p>JPG, PNG o WebP · hasta 20 MB</p>
          <button type="button" className="secondary-button choose-image" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Preparando imagen…' : 'Elegir imagen'}
          </button>
          <span className="drop-hint">o arrástrala aquí</span>
        </>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

function SavedCard({ puzzle, onOpen, onDelete }) {
  const imageUrl = useObjectUrl(puzzle.imageBlob);
  const remaining = puzzle.geometry.pieces.filter((piece) => !piece.locked).length;
  return (
    <article className="saved-card">
      <button className="saved-image-button" onClick={() => onOpen(puzzle)} aria-label={`Continuar ${puzzle.imageName}`}>
        {imageUrl && <img src={imageUrl} alt="" />}
        <span className="saved-image-count">{remaining} por colocar</span>
      </button>
      <div className="saved-card-copy">
        <div className="saved-card-heading"><h3 title={puzzle.imageName}>{puzzle.imageName}</h3><span>{formatDate(puzzle.updatedAt)}</span></div>
        <p>{puzzle.level} piezas{puzzle.timerEnabled ? ` · ${formatTime(puzzle.elapsedSeconds)}` : ' · Sin cronómetro'}</p>
        <div className="saved-actions">
          <button className="saved-open" onClick={() => onOpen(puzzle)}>Continuar</button>
          <button className="icon-button destructive" onClick={() => onDelete(puzzle.id)} aria-label={`Eliminar ${puzzle.imageName}`} title="Eliminar partida"><Trash2 size={16} /></button>
        </div>
      </div>
    </article>
  );
}

function Landing({ image, level, setLevel, rotationMode, setRotationMode, timerEnabled, setTimerEnabled, onFile, fileBusy, fileError, onStart, savedGames, onOpenSaved, onDeleteSaved, onImport, message }) {
  const importRef = useRef(null);
  return (
    <main className="home-main">
      <section className="home-intro">
        <div className="intro-copy">
          <div className="intro-chip"><span className="chip-dot" /> Tu imagen, otro punto de vista</div>
          <h1>Un buen recuerdo.<br /><span>Muchas piezas.</span></h1>
          <p>Convierte cualquier imagen en un rompecabezas y tómate el tiempo que quieras para armarlo.</p>
        </div>
        <div className="intro-art" aria-hidden="true">
          <div className="art-ribbon ribbon-one" /><div className="art-ribbon ribbon-two" />
          <div className="art-sun" />
          <div className="art-piece art-piece-one"><span /></div>
          <div className="art-piece art-piece-two"><span /></div>
          <div className="art-piece art-piece-three"><span /></div>
          <div className="art-piece art-piece-four"><span /></div>
          <div className="art-caption">un momento<br />a tu manera</div>
        </div>
      </section>

      <section className="builder-panel" aria-labelledby="builder-title">
        <div className="builder-heading">
          <div><h2 id="builder-title">Crea tu rompecabezas</h2><p>La imagen y el avance se quedan en este dispositivo.</p></div>
          <span className="private-label"><LockKeyhole size={14} /> Privado</span>
        </div>
        <div className="builder-grid">
          <ImageDrop image={image} busy={fileBusy} onFile={onFile} error={fileError} />
          <div className="builder-options">
            <DifficultyPicker value={level} onChange={setLevel} />
            <div className="option-row">
              <label className="option-label" htmlFor="rotation-mode">Rotación de piezas</label>
              <select id="rotation-mode" value={rotationMode} onChange={(event) => setRotationMode(event.target.value)}>
                <option value="fixed">Sin rotación</option>
                <option value="random">Orientación aleatoria</option>
                <option value="manual">Giro manual</option>
              </select>
              <p className="option-help">En los modos con giro, selecciona una pieza y usa el control de rotación.</p>
            </div>
            <label className="timer-toggle">
              <span className="timer-icon"><Clock3 size={17} /></span>
              <span><strong>Usar cronómetro</strong><small>Lo puedes activar o quitar cuando quieras.</small></span>
              <input type="checkbox" checked={timerEnabled} onChange={(event) => setTimerEnabled(event.target.checked)} />
              <span className="toggle-track" aria-hidden="true"><span /></span>
            </label>
            <button className="primary-button start-button" disabled={!image || fileBusy} onClick={onStart}>
              <Puzzle size={18} /> Crear rompecabezas <span className="button-level">{level} piezas</span>
            </button>
            <div className="import-row">
              <input ref={importRef} className="visually-hidden" type="file" accept=".puzlea,application/zip" onChange={(event) => { if (event.target.files?.[0]) void onImport(event.target.files[0]); event.target.value = ''; }} />
              <button className="text-button" onClick={() => importRef.current?.click()}><FolderOpen size={16} /> Abrir partida guardada</button>
              <span>archivo .puzlea</span>
            </div>
            {message && <p className="inline-message" role="status">{message}</p>}
          </div>
        </div>
        <div className="privacy-footnote"><ShieldCheck size={15} /><span>Solo se comparte una imagen si tú la envías a la galería.</span></div>
      </section>

      <section className="saved-section" aria-labelledby="saved-title">
        <div className="section-heading"><div><h2 id="saved-title">Tus partidas</h2><p>Se guardan automáticamente en este navegador.</p></div><span className="saved-count">{savedGames.length}</span></div>
        {savedGames.length ? (
          <div className="saved-grid">{savedGames.map((puzzle) => <SavedCard key={puzzle.id} puzzle={puzzle} onOpen={onOpenSaved} onDelete={onDeleteSaved} />)}</div>
        ) : (
          <div className="saved-empty"><span className="empty-icon"><FolderOpen size={19} /></span><p>Aquí aparecerá tu primera partida.</p></div>
        )}
      </section>
      <footer className="home-footer"><span>Puzlea guarda tus imágenes en tu navegador.</span><span>Una pausa, una pieza a la vez.</span></footer>
    </main>
  );
}

function AuthPanel({ user, onNotice }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { supabase } = await import('./lib/supabaseClient');
      if (!supabase) throw new Error('La conexión de cuentas no está configurada.');
      if (mode === 'signin') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        onNotice('Sesión iniciada.');
      } else {
        const { data, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        onNotice(data.session ? 'Cuenta creada.' : 'Revisa tu correo para confirmar la cuenta.');
      }
    } catch (authError) {
      setError(authError.message || 'No pudimos completar el acceso.');
    } finally {
      setBusy(false);
    }
  }

  if (user) return <div className="signed-in-note"><BadgeCheck size={19} /><span>Sesión activa como <strong>{user.email}</strong></span></div>;

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-card-heading"><span className="auth-icon"><UserRound size={18} /></span><div><h3>{mode === 'signin' ? 'Entra a tu cuenta' : 'Crea una cuenta'}</h3><p>Necesaria para enviar un puzle a revisión.</p></div></div>
      <label className="form-field">Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
      <label className="form-field">Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required /></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Un momento…' : mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}</button>
      <button type="button" className="text-button auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>
        {mode === 'signin' ? '¿Primera vez? Crear cuenta' : 'Ya tengo una cuenta'}
      </button>
    </form>
  );
}

function GalleryCard({ puzzle, onPlay }) {
  return (
    <article className="gallery-card">
      <button className="gallery-image" onClick={() => onPlay(puzzle)} aria-label={`Jugar ${puzzle.title}`}>
        <img src={puzzle.imageUrl} alt="" loading="lazy" />
        <span className="gallery-play"><Puzzle size={17} /> Jugar</span>
      </button>
      <div className="gallery-card-copy"><h3>{puzzle.title}</h3><p>{puzzle.description || 'Un rompecabezas compartido por la comunidad.'}</p></div>
    </article>
  );
}

function Gallery({ user, level, setLevel, rotationMode, timerEnabled, onOpenPuzzle, onNotice }) {
  const [items, setItems] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [shareImage, setShareImage] = useState(null);
  const [shareError, setShareError] = useState('');
  const [sharing, setSharing] = useState(false);
  const fileRef = useRef(null);

  async function refresh() {
    if (!supabaseConfigured) return;
    setLoading(true);
    setError('');
    try {
      const { listApprovedPuzzles } = await import('./lib/supabaseClient');
      setItems(await listApprovedPuzzles());
    } catch {
      setError('No pudimos cargar la galería. Inténtalo de nuevo en un momento.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!shareImage?.url) return undefined;
    return () => URL.revokeObjectURL(shareImage.url);
  }, [shareImage]);
  useEffect(() => {
    let active = true;
    async function loadOwn() {
      if (!user || !supabaseConfigured) { setSubmissions([]); return; }
      const { supabase } = await import('./lib/supabaseClient');
      const { data } = await supabase.from('gallery_puzzles').select('id,title,status,created_at').eq('author_id', user.id).order('created_at', { ascending: false });
      if (active) setSubmissions(data ?? []);
    }
    void loadOwn();
    return () => { active = false; };
  }, [user]);

  async function chooseShareImage(file) {
    setShareError('');
    try {
      const prepared = await prepareImage(file);
      setShareImage(prepared);
    } catch (imageError) {
      setShareError(imageError.message);
    }
  }

  async function share(event) {
    event.preventDefault();
    if (!user || !shareImage) return;
    setSharing(true);
    setShareError('');
    try {
      const { submitPuzzle, supabase } = await import('./lib/supabaseClient');
      await submitPuzzle({ imageBlob: shareImage.blob, title, description, userId: user.id });
      setShareImage(null);
      setTitle('');
      setDescription('');
      onNotice('Enviado a revisión. Se mostrará en la galería si se aprueba.');
      const { data } = await supabase.from('gallery_puzzles').select('id,title,status,created_at').eq('author_id', user.id).order('created_at', { ascending: false });
      setSubmissions(data ?? []);
    } catch (error) {
      setShareError(error instanceof Error && error.message.startsWith('La carga falló')
        ? error.message
        : 'No pudimos enviar este puzle. Revisa tu conexión e inténtalo otra vez.');
    } finally {
      setSharing(false);
    }
  }

  async function play(puzzle) {
    try {
      const response = await fetch(puzzle.imageUrl);
      if (!response.ok) throw new Error('download');
      const blob = await response.blob();
      const image = await prepareImage(new File([blob], `${puzzle.title}.jpg`, { type: 'image/jpeg' }));
      onOpenPuzzle(image, level, rotationMode, timerEnabled, puzzle.title);
    } catch {
      setError('No pudimos abrir esta imagen. Inténtalo de nuevo.');
    }
  }

  return (
    <main className="gallery-main">
      <section className="gallery-intro">
        <div className="intro-chip"><span className="chip-dot" /> Puzles compartidos</div>
        <h1>Encuentra una imagen.<br /><span>Hazla tuya.</span></h1>
        <p>Explora imágenes que la comunidad decidió compartir. Cada persona elige cómo armar su propio rompecabezas.</p>
      </section>
      {!supabaseConfigured ? (
        <section className="gallery-setup">
          <div className="setup-illustration"><Puzzle size={32} /></div>
          <div><h2>La galería aún no está conectada</h2><p>El juego, tus partidas y los archivos imprimibles funcionan ya en este dispositivo. Para activar cuentas y publicaciones, configura las variables de Supabase indicadas en el README.</p></div>
          <span className="setup-badge">Opcional</span>
        </section>
      ) : (
        <>
          <section className="gallery-controls">
            <DifficultyPicker value={level} onChange={setLevel} />
            <span className="gallery-level-note">Tu dificultad se aplica al empezar cada puzle.</span>
          </section>
          {error && <p className="field-error gallery-error" role="alert">{error}</p>}
          {loading ? <div className="gallery-empty"><span className="loading-spinner" /><p>Cargando puzles…</p></div> : items.length ? (
            <div className="gallery-grid">{items.map((item) => <GalleryCard key={item.id} puzzle={item} onPlay={play} />)}</div>
          ) : (
            <div className="gallery-empty"><span className="empty-icon"><Sparkles size={19} /></span><h2>La galería empieza contigo</h2><p>Cuando una publicación sea aprobada, aparecerá aquí.</p></div>
          )}
          <section className="share-section">
            <div className="share-heading"><span className="share-icon"><Upload size={19} /></span><div><h2>Comparte un puzle</h2><p>Los envíos se revisan antes de aparecer públicamente.</p></div></div>
            <div className="share-grid">
              <AuthPanel user={user} onNotice={onNotice} />
              <form className="share-form" onSubmit={share}>
                <div className="share-consent"><ShieldCheck size={17} /><p>Elige una imagen apta para todo público. La copia que compartas se subirá a revisión; tu partida privada no se modifica.</p></div>
                <label className="form-field">Nombre del puzle<input maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Un paseo por la montaña" required /></label>
                <label className="form-field">Descripción <span>(opcional)</span><textarea maxLength={240} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Cuéntanos algo breve sobre la imagen." /></label>
                <input ref={fileRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { if (event.target.files?.[0]) void chooseShareImage(event.target.files[0]); event.target.value = ''; }} />
                <div className="share-image-row">
                  {shareImage ? <span className="share-image-name"><Check size={15} /> {shareImage.name}</span> : <span className="share-image-empty">Aún no elegiste una imagen</span>}
                  <button type="button" className="secondary-button compact" onClick={() => fileRef.current?.click()}><ImagePlus size={16} /> Elegir imagen</button>
                </div>
                {shareError && <p className="field-error" role="alert">{shareError}</p>}
                <button className="primary-button share-submit" disabled={!user || !shareImage || sharing || !title.trim()}>{sharing ? 'Enviando…' : 'Enviar a revisión'}</button>
                {!user && <small className="form-hint">Inicia sesión o crea una cuenta para enviar.</small>}
              </form>
            </div>
            {user && submissions.length > 0 && (
              <div className="submission-list"><h3>Tus envíos</h3>{submissions.map((submission) => (
                <div className="submission-row" key={submission.id}><span>{submission.title}</span><span className={`submission-status ${submission.status}`}>{submission.status === 'pending' ? 'En revisión' : submission.status === 'approved' ? 'Publicado' : 'No aprobado'}</span></div>
              ))}</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Game({ puzzle, imageUrl, referenceImageUrl, printPreviewUrl, saveStatus, onChange, onBack, onExport, onPrint, onClosePrint }) {
  const [selectedId, setSelectedId] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const pieces = puzzle.geometry.pieces;
  const placed = pieces.filter((piece) => piece.locked).length;
  const done = placed === pieces.length;
  const canRotate = puzzle.rotationMode !== 'fixed';

  useEffect(() => {
    if (!puzzle.timerEnabled || done) return undefined;
    const interval = window.setInterval(() => onChange((current) => ({ ...current, elapsedSeconds: current.elapsedSeconds + 1, updatedAt: Date.now() })), 1000);
    return () => window.clearInterval(interval);
  }, [puzzle.timerEnabled, done, onChange]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.key === 'r' || event.key === 'R') && canRotate && selectedId !== null && !event.target.matches('input,textarea,select,button')) {
        event.preventDefault();
        rotateSelected();
      }
      if (event.key === 'Escape') setShowReference(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canRotate, selectedId, puzzle]);

  function rotateSelected() {
    if (!canRotate || selectedId === null) return;
    const updated = pieces.map((piece) => piece.id === selectedId && !piece.locked ? { ...piece, rotation: (piece.rotation + 90) % 360 } : piece);
    onChange({ ...puzzle, geometry: { ...puzzle.geometry, pieces: updated }, updatedAt: Date.now() });
  }

  return (
    <main className="game-main">
      <div className="game-topline">
        <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Salir</button>
        <div className="game-title"><span className="game-image-name" title={puzzle.imageName}>{puzzle.imageName}</span><span>{puzzle.level} piezas</span></div>
        <div className="game-progress"><span>{placed}</span><span className="progress-divider">/</span><span>{puzzle.level}</span><div className="progress-track"><span style={{ width: `${(placed / puzzle.level) * 100}%` }} /></div></div>
      </div>
      <div className="game-layout">
        <section className="game-board-column" aria-label="Zona de juego">
          <PuzzleStage puzzle={puzzle} imageUrl={imageUrl} onChange={onChange} selectedId={selectedId} onSelect={setSelectedId} showHint={showHint} />
          {done ? (
            <div className="completion-banner"><span className="completion-mark"><Check size={19} /></span><div><strong>¡Rompecabezas completo!</strong><span>{puzzle.timerEnabled ? `Lo armaste en ${formatTime(puzzle.elapsedSeconds)}.` : 'Buen momento, pieza a pieza.'}</span></div><button className="text-button" onClick={onBack}>Crear otro</button></div>
          ) : <p className="game-help"><span className="help-dot" /><span>Suelta cada pieza para comprobar si está en su lugar. Si no encaja, se queda donde la dejes.<small>También puedes seleccionarla, moverla con las flechas y pulsar Enter para comprobar.</small></span></p>}
        </section>
        <aside className="game-sidebar">
          <div className="side-panel side-progress">
            <div className="panel-heading"><div><span className="panel-kicker">Tu partida</span><h2>Vas por buen camino</h2></div><span className="progress-orbit"><Puzzle size={18} /></span></div>
            <div className="progress-large"><strong>{placed}</strong><span>de {puzzle.level} piezas</span></div>
            <div className="sidebar-progress-track"><span style={{ width: `${(placed / puzzle.level) * 100}%` }} /></div>
            {puzzle.timerEnabled ? <div className="timer-readout"><Clock3 size={16} /><span>{formatTime(puzzle.elapsedSeconds)}</span><small>tiempo</small></div> : <div className="timer-readout timer-off"><Clock3 size={16} /><span>Sin cronómetro</span></div>}
          </div>
          <div className="side-panel reference-panel">
            <div className="panel-heading"><div><span className="panel-kicker">Una pista</span><h2>La imagen original</h2></div><Eye size={17} className="panel-icon" /></div>
            <button className="reference-thumb" onClick={() => setShowReference(true)} aria-label="Ver imagen original">
              <img src={referenceImageUrl || imageUrl} alt="Imagen original del rompecabezas" />
              <span>Ver imagen completa</span>
            </button>
            <button className={`hint-toggle${showHint ? ' active' : ''}`} onClick={() => setShowHint((value) => !value)}>
              {showHint ? <EyeOff size={16} /> : <Eye size={16} />}{showHint ? 'Quitar imagen del tablero' : 'Verla suavemente en el tablero'}
            </button>
          </div>
          <div className="side-panel control-panel">
            <span className="panel-kicker">Controles</span>
            {canRotate ? (
              <button className="secondary-button full-width" onClick={rotateSelected} disabled={selectedId === null || pieces.find((piece) => piece.id === selectedId)?.locked}>
                <RotateCw size={16} /> Girar pieza <kbd>R</kbd>
              </button>
            ) : <p className="control-note">Las piezas mantienen su orientación original.</p>}
            <div className="control-divider" />
            <button className="secondary-button full-width" onClick={onExport}><ArrowDownToLine size={16} /> Guardar partida</button>
            <button className="secondary-button full-width" onClick={onPrint}><Printer size={16} /> Preparar PDF imprimible</button>
            <p className={`save-note${saveStatus === 'error' ? ' save-note-error' : ''}`}>
              <span className="save-dot" />
              {saveStatus === 'saving' ? 'Guardando en este dispositivo…' : saveStatus === 'error' ? 'No se pudo guardar el avance.' : 'Guardado automático en este dispositivo'}
            </p>
          </div>
        </aside>
      </div>
      {showReference && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowReference(false); }}>
          <section className="reference-modal" role="dialog" aria-modal="true" aria-labelledby="reference-title">
            <div className="reference-modal-head"><div><span className="panel-kicker">Pista</span><h2 id="reference-title">Imagen original</h2></div><button className="icon-button" onClick={() => setShowReference(false)} aria-label="Cerrar"><X size={18} /></button></div>
            <img src={referenceImageUrl || imageUrl} alt="Referencia completa del rompecabezas" />
            <p>Puedes volver al tablero cuando quieras.</p>
          </section>
        </div>
      )}
      {printPreviewUrl && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClosePrint(); }}>
          <section className="pdf-preview-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-title">
            <div className="reference-modal-head">
              <div><span className="panel-kicker">Plantilla de corte</span><h2 id="pdf-preview-title">Vista previa del PDF</h2></div>
              <div className="pdf-preview-actions">
                <a className="secondary-button" href={printPreviewUrl} download={`puzlea-${puzzle.level}-piezas.pdf`}><ArrowDownToLine size={15} /> Descargar</a>
                <button className="icon-button" onClick={onClosePrint} aria-label="Cerrar vista previa"><X size={18} /></button>
              </div>
            </div>
            <iframe className="pdf-preview-frame" src={printPreviewUrl} title="Vista previa del rompecabezas para imprimir" />
            <p className="pdf-preview-note">Las páginas están preparadas en tamaño carta e incluyen solapamiento y marcas de registro.</p>
          </section>
        </div>
      )}
    </main>
  );
}

export default function App() {
  const [page, setPage] = useState('home');
  const [image, setImage] = useState(null);
  const [game, setGame] = useState(null);
  const [level, setLevel] = useState(24);
  const [rotationMode, setRotationMode] = useState('fixed');
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [savedGames, setSavedGames] = useState([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [notice, setNotice] = useState('');
  const [printPreviewUrl, setPrintPreviewUrl] = useState('');
  const [user, setUser] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved');
  const deletedSessionIds = useRef(new Set());
  const latestGame = useRef(game);
  latestGame.current = game;
  const gameImageUrl = useObjectUrl(game?.imageBlob);
  const gameReferenceImageUrl = useObjectUrl(game?.originalImageBlob ?? game?.imageBlob);
  useEffect(() => () => {
    if (printPreviewUrl) URL.revokeObjectURL(printPreviewUrl);
  }, [printPreviewUrl]);
  const handleGameChange = useCallback((next) => {
    setGame((current) => typeof next === 'function' ? next(current) : next);
  }, []);

  useEffect(() => {
    let active = true;
    listPuzzles().then((items) => { if (active) setSavedGames(items); }).catch(() => { if (active) setNotice('No pudimos leer las partidas guardadas en este navegador.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return undefined;
    let active = true;
    let subscription;
    import('./lib/supabaseClient').then(({ supabase }) => {
      if (!active || !supabase) return;
      supabase.auth.getSession().then(({ data }) => { if (active) setUser(data.session?.user ?? null); });
      const result = supabase.auth.onAuthStateChange((_event, session) => { if (active) setUser(session?.user ?? null); });
      subscription = result.data.subscription;
    });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!image?.url) return undefined;
    return () => URL.revokeObjectURL(image.url);
  }, [image]);

  useEffect(() => {
    if (!game) return undefined;
    const snapshot = game;
    let active = true;
    setSaveStatus('saving');
    const timeout = window.setTimeout(async () => {
      if (deletedSessionIds.current.has(snapshot.id)) return;
      try {
        await savePuzzle(snapshot);
        if (!active || deletedSessionIds.current.has(snapshot.id) || latestGame.current?.updatedAt !== snapshot.updatedAt) return;
        setSavedGames((current) => [snapshot, ...current.filter((item) => item.id !== snapshot.id)].sort((a, b) => b.updatedAt - a.updatedAt));
        setSaveStatus('saved');
      } catch {
        if (active && !deletedSessionIds.current.has(snapshot.id) && latestGame.current?.updatedAt === snapshot.updatedAt) {
          setSaveStatus('error');
          setNotice('No se pudo guardar el avance en este dispositivo. Puedes seguir jugando.');
        }
      }
    }, 650);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [game]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 5200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function handleImage(file) {
    setFileBusy(true);
    setFileError('');
    try {
      const prepared = await prepareImage(file);
      setImage(prepared);
    } catch (error) {
      setFileError(error.message || 'No pudimos preparar esta imagen.');
    } finally {
      setFileBusy(false);
    }
  }

  function startPuzzle(sourceImage, selectedLevel, selectedRotation, selectedTimer, name) {
    const geometry = createPuzzle(selectedLevel, sourceImage.width, sourceImage.height, selectedRotation);
    const next = {
      id: crypto.randomUUID(),
      formatVersion: 2,
      imageName: name || sourceImage.name,
      imageType: 'image/jpeg',
      imageWidth: sourceImage.width,
      imageHeight: sourceImage.height,
      imageBlob: sourceImage.blob,
      originalImageBlob: sourceImage.originalBlob ?? sourceImage.blob,
      originalImageType: sourceImage.originalType ?? sourceImage.blob.type ?? 'image/jpeg',
      originalImageName: sourceImage.originalName ?? sourceImage.name,
      level: selectedLevel,
      rotationMode: selectedRotation,
      timerEnabled: selectedTimer,
      elapsedSeconds: 0,
      boardWidth: geometry.width,
      boardHeight: geometry.height,
      geometry,
      updatedAt: Date.now(),
    };
    deletedSessionIds.current.delete(next.id);
    setGame(next);
    setPage('game');
  }

  async function importPuzzle(file) {
    setFileError('');
    try {
      const { readPuzzleArchive } = await import('./lib/puzzleArchive');
      const loaded = await readPuzzleArchive(file);
      const bitmap = await createImageBitmap(loaded.imageBlob);
      if (bitmap.width !== loaded.imageWidth || bitmap.height !== loaded.imageHeight) {
        bitmap.close();
        throw new Error('La imagen y el tablero del archivo no coinciden.');
      }
      bitmap.close();
      deletedSessionIds.current.delete(loaded.id);
      await savePuzzle(loaded);
      setSavedGames((current) => [loaded, ...current.filter((item) => item.id !== loaded.id)]);
      setGame(loaded);
      setPage('game');
    } catch (error) {
      setFileError(error.message || 'No pudimos importar esta partida.');
      setPage('home');
    }
  }

  async function openSaved(puzzle) {
    try {
      const latest = await getPuzzle(puzzle.id);
      if (!latest || deletedSessionIds.current.has(puzzle.id)) {
        setSavedGames((current) => current.filter((item) => item.id !== puzzle.id));
        setNotice('Esta partida ya no está guardada en este dispositivo.');
        return;
      }
      setGame(latest);
      setPage('game');
    } catch {
      setNotice('No pudimos abrir esta partida guardada.');
    }
  }

  async function removeSaved(id) {
    deletedSessionIds.current.add(id);
    if (latestGame.current?.id === id) setGame(null);
    try {
      await deletePuzzle(id);
      setSavedGames((current) => current.filter((item) => item.id !== id));
      setNotice('Partida eliminada de este dispositivo.');
    } catch {
      deletedSessionIds.current.delete(id);
      setNotice('No se pudo eliminar la partida.');
    }
  }

  async function exportGame() {
    try {
      const { downloadPuzzleArchive } = await import('./lib/puzzleArchive');
      await downloadPuzzleArchive(game);
    } catch { setNotice('No pudimos crear el archivo de partida.'); }
  }

  async function printGame() {
    setNotice('Preparando el PDF imprimible…');
    try {
      const { createPuzzlePdf } = await import('./lib/puzzlePdf');
      const pdf = await createPuzzlePdf(game);
      setPrintPreviewUrl(URL.createObjectURL(pdf));
      setNotice('PDF listo para revisar e imprimir.');
    }
    catch (error) { setNotice(error.message || 'No pudimos preparar el PDF.'); }
  }

  async function signOut() {
    if (!supabaseConfigured) return;
    const { supabase } = await import('./lib/supabaseClient');
    await supabase.auth.signOut();
    setNotice('Sesión cerrada.');
  }

  function openGalleryPuzzle(sourceImage, selectedLevel, selectedRotation, selectedTimer, title) {
    startPuzzle(sourceImage, selectedLevel, selectedRotation, selectedTimer, `${title}.jpg`);
    URL.revokeObjectURL(sourceImage.url);
  }

  return (
    <div className="app-shell">
      {page !== 'game' && <Header page={page} setPage={setPage} user={user} onSignOut={signOut} onAccount={() => setPage('gallery')} />}
      {page === 'game' && game ? (
        <Game
          puzzle={game}
          imageUrl={gameImageUrl}
          referenceImageUrl={gameReferenceImageUrl}
          printPreviewUrl={printPreviewUrl}
          saveStatus={saveStatus}
          onChange={handleGameChange}
          onBack={() => setPage('home')}
          onExport={exportGame}
          onPrint={printGame}
          onClosePrint={() => setPrintPreviewUrl('')}
        />
      ) : page === 'gallery' ? (
        <Gallery user={user} level={level} setLevel={setLevel} rotationMode={rotationMode} timerEnabled={timerEnabled} onOpenPuzzle={openGalleryPuzzle} onNotice={setNotice} />
      ) : (
        <Landing
          image={image}
          level={level}
          setLevel={setLevel}
          rotationMode={rotationMode}
          setRotationMode={setRotationMode}
          timerEnabled={timerEnabled}
          setTimerEnabled={setTimerEnabled}
          onFile={handleImage}
          fileBusy={fileBusy}
          fileError={fileError}
          onStart={() => image && startPuzzle(image, level, rotationMode, timerEnabled)}
          savedGames={savedGames}
          onOpenSaved={openSaved}
          onDeleteSaved={removeSaved}
          onImport={importPuzzle}
          message={notice}
        />
      )}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={15} /></button></div>}
    </div>
  );
}
