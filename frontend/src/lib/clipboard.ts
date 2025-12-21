/**
 * safeCopyToClipboard - Robust clipboard copy with fallback
 * 
 * The modern navigator.clipboard API is only available in Secure Contexts (HTTPS or localhost).
 * When accessing via IP address (common in LAN deployments), it may be undefined.
 * This utility provides a fallback using a hidden textarea and execCommand('copy').
 */
export async function safeCopyToClipboard(text: string): Promise<boolean> {
  try {
    // 1. Try modern async clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('Modern clipboard API failed, trying fallback...', err);
  }

  // 2. Fallback: temporary textarea + execCommand
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    
    // Prevent scrolling to bottom when appending
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    
    const success = document.execCommand('copy');
    document.body.removeChild(ta);
    
    return success;
  } catch (err) {
    console.error('Clipboard fallback also failed:', err);
    return false;
  }
}

