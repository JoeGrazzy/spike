-- SPIKE: retire the former ten-theme preference values before deploying the three-theme registry.
-- This changes only the theme preference; all other user settings remain untouched.
UPDATE public.user_app_settings
SET theme_style = 1,
    updated_at = NOW()
WHERE theme_style IS DISTINCT FROM 1;
