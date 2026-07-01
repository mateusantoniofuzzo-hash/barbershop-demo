# Publicar o app pela internet

Este projeto tem backend, login e gravacao de dados. Por isso, GitHub Pages nao e suficiente: ele publica apenas arquivos estaticos e nao roda o servidor Node.

O caminho recomendado e subir o codigo para o GitHub e conectar o repositorio a uma hospedagem que rode Node.js, como Render, Railway, Fly.io, DigitalOcean App Platform ou um VPS.

## 1. Subir no GitHub

Na pasta do projeto:

```bash
git init
git add .
git commit -m "MVP de agendamentos da barbearia"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git
git push -u origin main
```

## 2. Variaveis de ambiente importantes

Configure no painel da hospedagem:

- `PORT`: normalmente o provedor define automaticamente.
- `DATA_DIR`: pasta persistente para o banco JSON, por exemplo `/var/data`.
- `SHOP_NAME`: nome da barbearia.
- `SHOP_WHATSAPP`: WhatsApp principal com DDI e DDD, exemplo `5511999999999`.
- `ADMIN_EMAIL`: e-mail inicial do administrador.
- `ADMIN_PASSWORD`: senha inicial segura do administrador.

Esses dados sao usados somente quando o banco ainda nao existe. Depois que o banco for criado, alteracoes devem ser feitas pelo painel admin ou apagando/recriando o banco.

## 3. Deploy pelo Render Blueprint

O arquivo `render.yaml` ja esta pronto. No Render, crie um novo Blueprint a partir do repositorio do GitHub.

Durante a configuracao, preencha pelo menos:

- `SHOP_WHATSAPP`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

O app usa `/api/health` como rota de saude.

## 4. Deploy por Docker

Tambem existe um `Dockerfile`. Em qualquer provedor que aceite Docker:

```bash
docker build -t barbearia-prime .
docker run -p 3000:3000 -e DATA_DIR=/data -v barbearia-data:/data barbearia-prime
```

## 5. Rodar localmente

```bash
npm install
npm start
```

Acesse `http://localhost:3000`.

## Observacao sobre banco de dados

O MVP usa um banco JSON persistente. Para uso profissional com muitas pessoas acessando ao mesmo tempo, o proximo passo natural e trocar essa camada por PostgreSQL/Supabase ou Firebase. A interface e as rotas ja estao organizadas para facilitar essa evolucao.
