# Sorter · Mapa no celular (Vercel)

O app do Windows (aberto num PC da empresa) desenha o Mapa e envia a cada 30 s para este site. O celular abre o link e vê o Mapa ao vivo, em qualquer rede. O sorter não é acessado pela internet.

## 1) GitHub
Crie um repositório (**privado** é melhor) e suba o conteúdo desta pasta (as pastas `api` e `public`, `package.json`, `vercel.json`).

## 2) Vercel
1. vercel.com → **Add New… → Project** → importe o repositório.
2. Framework Preset: **Other**. Não mexa em mais nada → **Deploy**.

## 3) Banco (Upstash Redis, grátis)
No projeto da Vercel: **Storage → Create Database → Upstash Redis (Marketplace)** → plano Free → conecte ao projeto. Isso cria sozinho as variáveis de acesso.

## 4) Chaves
Em **Settings → Environment Variables** crie (Production):
- `PUSH_KEY` = `Nwb5wFSJz1T1L93n_zhK27v2`
- `VIEW_KEY` = `hDXSpDzDXpGcOu-f9DVM8gdd`

Depois **Deployments → ⋯ → Redeploy**.
Se o site pedir login da Vercel, desligue em **Settings → Deployment Protection** (senão o app não consegue enviar).

## 5) App do Windows
Configurações → **Destinos e mensagens**:
- *Mapa no celular: endereço do site* = o endereço do projeto (ex.: https://meu-sorter.vercel.app)
- *Mapa no celular: chave de envio* = o valor de `PUSH_KEY`

## 6) Celular
Abra **https://SEU-SITE.vercel.app/#k=hDXSpDzDXpGcOu-f9DVM8gdd** uma vez (a chave fica salva) e use *Adicionar à tela inicial*.

## Observações
- O app precisa estar aberto no PC para enviar. Sem dados há 2 min o celular avisa.
- Quem tiver o link com a chave vê o Mapa: não compartilhe.
- Gasto no plano grátis: cerca de 2 comandos/minuto por celular aberto.
