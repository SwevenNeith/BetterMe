INSERT INTO public.journal_prompts (user_id, prompt_text)
SELECT
  users.id,
  prompts.prompt_text
FROM auth.users AS users
CROSS JOIN (
  VALUES
    ('Qu’est-ce qui m’a fait du bien aujourd’hui ?'),
    ('De quoi suis-je fière aujourd’hui ?'),
    ('Qu’est-ce que j’ai appris sur moi récemment ?'),
    ('Quelle émotion a pris le plus de place aujourd’hui, et pourquoi ?'),
    ('De quoi ai-je besoin en ce moment ?'),
    ('Quel petit pas me ferait avancer aujourd’hui ?'),
    ('Qu’est-ce que j’aimerais relâcher ce soir ?'),
    ('Quel moment de la journée ai-je envie de garder en mémoire ?'),
    ('Quelle pensée revient souvent en ce moment ?'),
    ('Si je pouvais me parler avec douceur aujourd’hui, que me dirais-je ?')
) AS prompts(prompt_text)
ON CONFLICT (user_id, prompt_text) DO NOTHING;
