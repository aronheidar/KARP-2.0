@echo off
REM ============================================================
REM  Karp - endurnyja frumvorp + atkvaedi fra Althingi
REM  Tvismelltu (eda settu i Task Scheduler t.d. vikulega).
REM  Saekir nyjustu mal + OLL nafnakoll fra althingi.is og
REM  byggir karp-data.txt upp a nytt. Tekur nokkrar minutur.
REM ============================================================
cd /d "C:\Users\aronh\OneDrive\Documents\KARP\hagvisir"

echo.
echo [1/3] Sae ki og vinn frumvorp fra Althingi (nokkrar minutur)...
node skriptur\build_frumvorp.js
if errorlevel 1 goto err

echo.
echo [2/4] AI-samantektir a nyjum malum (sleppt ef ANTHROPIC_API_KEY vantar)...
REM  Ekki fatal: eldri samantektir haldast ur minni; missir lykill stoppar ekki endurnyjun.
node skriptur\build_summaries.js

echo.
echo [3/4] Fylgi flokka (skodanakannanir fra Wikipedia)...
REM  Ekki fatal: ef Wikipedia svarar ekki helst eldra polls.json.
node skriptur\build_polls.js

echo.
echo [4/4] Bygg karp-data.txt + embed...
node build_embed.js
if errorlevel 1 goto err

echo.
echo ============================================================
echo  BUID!  Naesta skref (eina handvirka skrefid):
echo    Endurhladdu  wordpress\karp-data.txt  i WP Media (sama slod).
echo    (Snippet 2867 tharf EKKI ad uppfaera - bara gognin breyttust.)
echo ============================================================
echo.
pause
exit /b 0

:err
echo.
echo *** VILLA kom upp - skodadu skilabodin ad ofan. ***
pause
exit /b 1
