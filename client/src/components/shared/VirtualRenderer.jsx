import { stripChords, stripComments } from '../../utils/chordUtils';

// ─── Helper: estilos del fondo del bloque de texto ───────────────────────────
function textBgStyle(vc) {
  if (!vc?.textBg) return {};
  const shape = vc.textBgShape ?? 'rectangle';
  const r = shape === 'rectangle' ? '4px' : shape === 'rounded' ? '16px' : '9999px';
  const hex = vc.textBgColor ?? '#000000';
  const op  = vc.textBgOpacity ?? 0.5;
  const n   = parseInt(hex.slice(1), 16);
  const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  return {
    backgroundColor: `rgba(${rgb}, ${op})`,
    borderRadius:    r,
    padding:         `${vc.textBgPadY ?? 12}px ${vc.textBgPadX ?? 24}px`,
    display:         'inline-block',
  };
}

// ─── Contenido del slide virtual ─────────────────────────────────────────────
function VirtualSlideContent({ slideData, vc, textAlign }) {
  const fontSizePx      = vc?.fontSizePx      ?? 48;
  const fontColor       = vc?.fontColor       ?? '#ffffff';
  const fontBold        = vc?.fontBold        ?? false;
  const fontItalic      = vc?.fontItalic      ?? false;
  const fontStrokeWidth = vc?.fontStrokeWidth ?? 0;
  const fontStrokeColor = vc?.fontStrokeColor ?? '#000000';

  const stroke = fontStrokeWidth > 0
    ? [[1,0],[-1,0],[0,1],[0,-1]]
        .map(([dx, dy]) => `${dx * fontStrokeWidth}px ${dy * fontStrokeWidth}px 0 ${fontStrokeColor}`)
        .join(', ')
    : null;

  const baseTextStyle = {
    fontSize:   `${fontSizePx}px`,
    color:      fontColor,
    fontWeight: fontBold   ? 'bold'   : 'normal',
    fontStyle:  fontItalic ? 'italic' : 'normal',
    textShadow: stroke ?? '0 2px 12px rgba(0,0,0,0.9)',
    lineHeight: 1.35,
    whiteSpace: 'pre-line',
    textAlign,
  };

  const bgSt    = textBgStyle(vc);
  const wrapSt  = { textAlign, maxWidth: '100%' };

  if (slideData.type === 'title') {
    return (
      <div style={wrapSt}>
        <div style={bgSt}>
          <p style={{ ...baseTextStyle, fontWeight: 'bold' }}>{slideData.songTitle}</p>
          {slideData.songAuthor && (
            <p style={{ ...baseTextStyle, fontSize: `${Math.round(fontSizePx * 0.6)}px`, opacity: 0.75, marginTop: '0.4em', fontWeight: 'normal' }}>
              {slideData.songAuthor}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (slideData.type === 'song') {
    const raw          = (vc.showComments ?? false) ? (slideData.content ?? '') : stripComments(slideData.content ?? '');
    const cleanContent = stripChords(raw);
    return (
      <div style={wrapSt}>
        <div style={bgSt}>
          <p style={baseTextStyle}>{cleanContent}</p>
        </div>
      </div>
    );
  }

  if (slideData.type === 'bible') {
    const refText = `${slideData.reference}${slideData.version ? ` (${slideData.version})` : ''}`;
    const bibleRefEnabled   = vc?.bibleRefEnabled   ?? false;

    if (!bibleRefEnabled) {
      // Comportamiento original: referencia dentro del mismo bloque
      return (
        <div style={wrapSt}>
          <div style={bgSt}>
            <p style={baseTextStyle}>{slideData.text}</p>
            <p style={{ ...baseTextStyle, fontSize: `${Math.round(fontSizePx * 0.5)}px`, opacity: 0.7, marginTop: '0.5em' }}>
              {refText}
            </p>
          </div>
        </div>
      );
    }

    // Cita bíblica con estilo propio
    const refFontSize  = vc?.bibleRefFontSize  ?? 24;
    const refBgColor   = vc?.bibleRefBgColor   ?? '#000000';
    const refBgShape   = vc?.bibleRefBgShape   ?? 'rounded';
    const refBgOpacity = vc?.bibleRefBgOpacity ?? 0.6;
    const refPosition  = vc?.bibleRefPosition  ?? 'bottom-right';

    const [refVertical, refHorizontal] = refPosition.split('-');

    // Fondo de la cita
    const refN   = parseInt(refBgColor.slice(1), 16);
    const refRgb = `${(refN >> 16) & 255}, ${(refN >> 8) & 255}, ${refN & 255}`;
    const refBgR = refBgShape === 'rectangle' ? '4px' : refBgShape === 'rounded' ? '0.5em' : '9999px';
    const refBgSt = {
      backgroundColor: `rgba(${refRgb}, ${refBgOpacity})`,
      borderRadius:    refBgR,
      padding:         '0.25em 0.75em',
      display:         'inline-block',
    };

    const refAlignSelf  = refHorizontal === 'left' ? 'flex-start' : refHorizontal === 'right' ? 'flex-end' : 'center';
    const refTextAlign  = refHorizontal === 'left' ? 'left'       : refHorizontal === 'right' ? 'right'    : 'center';
    const refTextStyle  = { ...baseTextStyle, fontSize: `${refFontSize}px`, textAlign: refTextAlign };

    const refElement = (
      <div style={{ alignSelf: refAlignSelf }}>
        <div style={refBgSt}>
          <p style={refTextStyle}>{refText}</p>
        </div>
      </div>
    );

    return (
      <div style={wrapSt}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5em' }}>
          {refVertical === 'top' && refElement}
          <div style={{ alignSelf: 'stretch' }}>
            <div style={bgSt}>
              <p style={baseTextStyle}>{slideData.text}</p>
            </div>
          </div>
          {refVertical === 'bottom' && refElement}
        </div>
      </div>
    );
  }

  if (slideData.type === 'media') {
    const { url, mediaType } = slideData;
    if (mediaType === 'video') {
      if (!(vc?.showVideo ?? true)) return null;
      return (
        <video
          key={url}
          src={url}
          autoPlay
          loop
          muted={false}
          playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: 'transparent' }}
        />
      );
    }
    return (
      <img
        key={url}
        src={url}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: 'transparent' }}
      />
    );
  }

  return null;
}

// ─── Componente principal exportado ──────────────────────────────────────────
/**
 * VirtualRenderer — render idéntico al de la ventana /virtual.
 * Usado tanto en VirtualPage (pantalla completa) como en LivePreview (escalado).
 *
 * Props:
 *  - vc        : virtualConfig
 *  - slideData : slide activo (puede ser null)
 *  - isBlank   : boolean
 */
export default function VirtualRenderer({ vc = {}, slideData, isBlank, backgroundMedia }) {
  const bgStyle = (() => {
    if (vc.background?.type === 'chromakey') return { backgroundColor: vc.chromaColor ?? '#00b140' };
    if (vc.background?.type === 'color')     return { backgroundColor: vc.background.color ?? '#000000' };
    return { backgroundColor: 'transparent' };
  })();

  const alignXMap    = { left: 'flex-start', center: 'center', right: 'flex-end' };
  const alignYMap    = { top: 'flex-start',  center: 'center', bottom: 'flex-end' };
  const textAlignMap = { left: 'left',       center: 'center', right: 'right' };
  const alignX       = vc?.alignX ?? 'center';
  const alignY       = vc?.alignY ?? 'center';

  const containerStyle = {
    display:        'flex',
    alignItems:     alignYMap[alignY]  ?? 'center',
    justifyContent: alignXMap[alignX]  ?? 'center',
    width:          '100%',
    height:         '100%',
    padding:        '3rem',
    boxSizing:      'border-box',
  };

  const showVideo  = vc?.showVideo ?? true;
  const hasBgMedia = !isBlank && !!backgroundMedia && (backgroundMedia.mediaType !== 'video' || showVideo);

  return (
    <div style={{ ...bgStyle, width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Capa de fondo multimedia (primerPlano=false) */}
      {hasBgMedia && (
        backgroundMedia.mediaType === 'video'
          ? <video key={backgroundMedia.url} src={backgroundMedia.url} autoPlay loop playsInline data-bg-video="1"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: 'transparent', zIndex: 0 }} />
          : <img key={backgroundMedia.url} src={backgroundMedia.url} alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: 'transparent', zIndex: 0 }} />
      )}
      {isBlank || !slideData || (hasBgMedia && slideData.type === 'media') ? null : (
        <div style={{ ...containerStyle, position: 'relative', zIndex: 1 }}>
          <VirtualSlideContent
            slideData={slideData}
            vc={vc}
            textAlign={textAlignMap[alignX] ?? 'center'}
          />
        </div>
      )}
    </div>
  );
}
