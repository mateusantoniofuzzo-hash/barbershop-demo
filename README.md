# Barbearia Prime - MVP de Agendamentos

Web app funcional para gestão de agendamentos de barbearia, com autenticação, perfis de cliente, barbeiro e admin, persistência local e integração com WhatsApp.

## Rodar

```bash
npm start
```

Acesse: http://localhost:3000

## Acessos demo

- Cliente: `cliente@barbearia.local` / `Cliente123!`
- Barbeiro: `marcos@barbearia.local` / `Barber123!`
- Admin: `admin@barbearia.local` / `Admin123!`

## O que está incluído

- Cadastro e login com senha protegida por hash `scrypt`.
- Banco persistente local em `data/db.json`, criado automaticamente no primeiro start.
- Bloqueio de agendamento duplicado para mesmo barbeiro, data e horário.
- Validação de disponibilidade por dia, horário, duração e bloqueios do admin.
- Painel do cliente com barbeiros, próximos agendamentos, histórico, remarcação e cancelamento.
- Modal de WhatsApp com mensagem preenchida e link no formato `wa.me`.
- Painel do barbeiro com visualização por dia/semana e ações de status.
- Painel admin com dashboard, barbeiros, horários, bloqueios, clientes e edição de agendamentos.

## Observação técnica

O MVP não depende de serviços externos. A estrutura foi mantida simples para permitir troca futura da camada de persistência por Supabase, Firebase ou SQLite sem reescrever a interface.