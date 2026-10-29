/**
 * Copying text, with the failure modes actually handled.
 *
 * `navigator.clipboard` is absent outside secure contexts and its writeText can
 * reject (denied permission, an unfocused document), so the obvious one-liner —
 * `navigator.clipboard?.writeText(text)` — fails silently in several ordinary
 * situations and looks identical to success. Falling back to the legacy
 * execCommand path covers those, and the boolean lets callers tell the user
 * which happened instead of leaving them guessing.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or no focus — try the legacy path before giving up.
  }

  try {
    const scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    // Off-screen but still focusable; display:none or visibility:hidden can't be selected.
    scratch.style.position = "fixed";
    scratch.style.top = "-1000px";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(scratch);
    return copied;
  } catch {
    return false;
  }
}
