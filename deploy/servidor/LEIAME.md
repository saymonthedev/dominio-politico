# Domínio Político num servidor próprio (AWS)

Plano B, caso o jogo precise sair da Vercel: põe o jogo num servidor próprio na AWS. O banco continua
no Supabase. Depois de instalado, todo commit na `main` do GitHub entra no ar sozinho em poucos
minutos, como na Vercel.

**Custo:** a AWS anuncia US$ 100 de crédito para contas novas no plano gratuito, mas a conta criada
em novembro de 2026 não recebeu nenhum. Confira em **Faturamento → Créditos** antes de criar a
máquina. Sem crédito, esta máquina custa uns US$ 18 por mês.

## 1. Criar o servidor (~10 min)

1. No console da AWS, confira a região no canto de cima, à direita: **Estados Unidos (Ohio)**.
2. **EC2 → Executar instância**. Nome: `dominio-politico`.
3. **Imagem:** *Ubuntu Server 24.04 LTS*, arquitetura **64 bits (Arm)**.
4. **Tipo de instância:** `t4g.small`.
5. **Par de chaves:** *Prosseguir sem um par de chaves* (a conexão é pelo navegador).
6. **Configurações de rede:** marque *Permitir tráfego SSH*, *Permitir tráfego HTTPS* e
   *Permitir tráfego HTTP* da internet.
7. **Armazenamento:** `30` GiB, `gp3`.
8. **Executar instância.**

## 2. IP fixo (~2 min)

Sem isso, o IP muda se a máquina for desligada e ligada, e o site sai do ar.

1. **EC2 → IPs elásticos → Alocar endereço IP elástico → Alocar.**
2. Com o IP novo marcado: **Ações → Associar endereço IP elástico**, escolha a instância
   `dominio-politico` e **Associar**.
3. Anote esse IP: é o endereço do servidor daqui em diante.

## 3. Apontar o domínio (~2 min)

No **Registro.br** → seu domínio → **DNS → Editar zona**:

- Apague os dois registros **A** do domínio principal que apontavam para a Vercel
  (`64.29.17.1` e `216.198.79.1`) e crie um **A** com o IP do servidor. Se houver registro
  **AAAA**, apague também.
- Troque o **CNAME** do `www` (`c6c8c6b8be01d89a.vercel-dns-017.com`) por `dominio-politico.com.br`.
- **Não mexa nos registros TXT** (verificação do Google).

## 4. Instalar o jogo (1 comando, ~15 min)

1. **EC2 → Instâncias**, marque `dominio-politico` → **Conectar** → aba **EC2 Instance Connect**
   → **Conectar**. Abre um terminal no navegador.
2. Cole:
   ```
   curl -fsSL https://raw.githubusercontent.com/saymonthedev/dominio-politico/main/deploy/servidor/instalar.sh | sudo bash
   ```
3. Quando pedir a **chave da Resend** (e-mails de aviso), cole uma chave nova
   (resend.com → *API Keys* → *Create*) ou aperte Enter para pular. Sem ela, o jogo funciona,
   mas não avisa nem apaga mundos próprios parados.
4. No fim aparecem o **IP** e um **código de conferência**. Mande os dois para o Claude, que
   cadastra o código no banco (sem isso o servidor não consegue gravar o mundo).

O HTTPS liga sozinho quando o domínio já aponta para o servidor (o certificado é grátis e se renova
sozinho).

## No dia a dia

| Para | Comando no servidor |
| --- | --- |
| Ver se o jogo está no ar | `systemctl status dominio-politico` |
| Ver erros do jogo | `journalctl -u dominio-politico -n 100` |
| Ver a última publicação | `journalctl -u dominio-politico-atualizar -n 50` |
| Publicar na hora | `sudo dominio-politico-atualizar` |
| Republicar a mesma versão | `sudo dominio-politico-atualizar --forcar` |
| Mudar a configuração | `sudo nano /etc/dominio-politico.env` e depois `sudo systemctl restart dominio-politico` |

Um commit cujo build falhou não é tentado de novo sozinho: o jogo segue na versão anterior até o
próximo commit (ou até `--forcar`).
