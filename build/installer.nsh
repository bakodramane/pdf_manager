; Custom NSIS hooks, included by electron-builder (nsis.include).
;
; Records the language picked in the installer's language dialog so the app
; opens in the same language on first launch. electron/main.cjs reads this
; file; the user can still switch language inside the app at any time.
;   1036 = French (LANG_FRENCH); anything else falls back to English.

!macro customInstall
  StrCpy $0 "en"
  StrCmp $LANGUAGE "1036" 0 +2
    StrCpy $0 "fr"
  FileOpen $1 "$INSTDIR\ui-language.txt" w
  FileWrite $1 $0
  FileClose $1
!macroend

!macro customUnInstall
  Delete "$INSTDIR\ui-language.txt"
!macroend
