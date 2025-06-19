flyctl logs -a hoodx

git add -A && git commit -m "fix: correct edge function name from blaze_history_megaroulette to blaze-mg-pragmatic in all references"

git push origin main

flyctl deploy