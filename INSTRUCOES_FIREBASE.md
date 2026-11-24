# Guia Rápido — Firebase + Vercel (armazenamento na nuvem, grátis)

Este app agora salva seus dados no **Firebase Firestore** (nuvem) e mantém uma cópia no **localStorage** do navegador. Assim você usa no celular e no computador, e não perde dados se limpar o cache.

## Passo 1: Criar projeto no Firebase

1. Acesse https://console.firebase.google.com/
2. Clique em **"Adicionar projeto"**, dê um nome (ex: `checklist-equipamentos`) e siga até criar.
3. No painel do projeto, clique no ícone **</>** (adicionar app Web).
4. Dê um apelido ao app e registre.
5. Copie o objeto `firebaseConfig` que aparece.

## Passo 2: Preencher credenciais no app

Abra o arquivo `D:\Faculdade\Wit Checklist/firebase-config.js` e cole os valores copiados:

```javascript
const firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO_ID",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};
```

Salve o arquivo.

## Passo 3: Criar banco de dados Firestore

1. No Firebase Console, vá em **Build > Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha **Iniciar em modo de teste** (permite leitura/escrita sem autenticação — suficiente para uso individual).
4. Escolha a região mais próxima (ex: `southamerica-east1` para São Paulo).
5. Pronto. O banco está vazio; o app vai criar as coleções automaticamente ao salvar o primeiro relatório.

## Passo 4: Hospedar no Vercel (opcional, recomendado)

1. Acesse https://vercel.com/ e crie uma conta (grátis).
2. Clique em **Add New Project** e importe seus arquivos (ou faça upload da pasta `Wit Checklist`).
3. O Vercel detecta que é um site estático e publica automaticamente.
4. Acesse a URL gerada (ex: `https://seu-app.vercel.app`).
5. No celular, abra essa URL e adicione à tela inicial (PWA).

> Dica: o Firebase funciona em qualquer domínio (incluindo o do Vercel). Se abrir o `index.html` diretamente pelo computador (arquivo local), o Firebase não carregará por segurança de CORS, mas o app continua funcionando com `localStorage`.

## Como usar no dia a dia

- Preencha **Instrutor(a)**, **Escola** e **Turno** (o app lembra disso na próxima vez).
- Marque a **declaração de responsabilidade** (obrigatória para gerar o laudo).
- Confira os equipamentos nos cartões ou nos **checkboxes de marcação rápida** (use "Selecionar todos").
- Clique em **Finalizar checklist e gerar relatório**. Será gerado um **número de laudo** (ex: `LAUDO-2026-0001`) e salvo no histórico.
- No modal do relatório, clique em **Gerar PDF** para baixar um arquivo `.pdf` de verdade (envie por WhatsApp/email ao coordenador).
- O badge no topo indica se está sincronizado com a nuvem (verde) ou apenas local (vermelho/cinza).

## Backup manual

Na aba **Dados e Backup**, clique em **Exportar backup (.json)** para salvar uma cópia completa de tudo (equipamentos, histórico, preferências e contador de laudo). Guarde esse arquivo no Google Drive, email ou onde preferir.

## Se trocar de celular/computador

1. Instale o app pelo link do Vercel (ou abra o `index.html` local).
2. Se usou Firebase, seus dados aparecem automaticamente na nuvem.
3. Se usou apenas local, importe o backup `.json` em **Dados e Backup > Importar backup**.
