!macro customInstall
  DetailPrint "Registrando licencia de hardware para este equipo..."
  nsExec::ExecToLog '"$INSTDIR\Libro Fiscal SENIAT.exe" --register'
!macroend
