# Domínio Político num servidor grátis (Oracle Cloud)

Tira o jogo da Vercel e põe num servidor próprio, grátis, em São Paulo. O banco continua no
Supabase. Depois de instalado, todo commit na `main` do GitHub entra no ar sozinho em poucos
minutos, como era na Vercel.

## 1. Criar a conta na Oracle (~15 min)

1. Acesse **cloud.oracle.com** → **Start for free**.
2. **Home region: Brazil East (São Paulo).** Não dá para trocar depois, e os recursos grátis
   ficam na região principal.
3. A Oracle pede cartão só para confirmar a identidade (pode aparecer uma cobrança de teste,
   estornada). A conta "Always Free" não cobra nada enquanto você não fizer upgrade.

## 2. Criar o servidor (~10 min)

1. Menu → **Compute → Instances → Create instance**. Nome: `dominio-politico`.
2. **Image:** Canonical **Ubuntu 24.04**.
3. **Shape:** *Change shape* → **Ampere** → **VM.Standard.A1.Flex**, com o máximo marcado como
   *Always Free-eligible* (hoje 2 OCPUs e 12 GB de memória).
4. **Networking:** deixe criar a rede nova, **com IP público**.
5. **SSH keys:** *Generate a key pair for me* → **baixe a chave privada** e guarde bem.
6. **Create.** Se aparecer *Out of capacity*, tente outro *Availability domain* ou mais tarde.

## 3. Abrir as portas do site (~3 min)

Na página do servidor: **Primary VNIC → Subnet → Default Security List → Add Ingress Rules**.
Crie duas regras com *Source CIDR* `0.0.0.0/0`, *IP Protocol* TCP e *Destination Port* `80` e
depois `443`.

## 4. Instalar o jogo (1 comando, ~10 min)

1. Copie o **Public IP address** do servidor.
2. Entre no servidor. Pelo navegador: botão **Cloud Shell** (`>_`) no topo do console da Oracle,
   envie a chave baixada (menu do Cloud Shell → *Upload*) e rode:
   ```
   chmod 600 ssh-key-*.key
   ssh -i ssh-key-*.key ubuntu@IP_DO_SERVIDOR
   ```
3. Já dentro do servidor, cole:
   ```
   curl -fsSL https://raw.githubusercontent.com/saymonthedev/dominio-politico/main/deploy/servidor/instalar.sh | sudo bash
   ```
4. Quando pedir a **chave da Resend** (e-mails de aviso), cole uma chave nova
   (resend.com → *API Keys* → *Create*) ou aperte Enter para pular. Sem ela, o jogo funciona,
   mas não avisa nem apaga mundos próprios parados.
5. No fim aparecem o **IP** e um **código de conferência**. Mande os dois para o Claude, que
   cadastra o código no banco (sem isso o servidor não consegue gravar o mundo).

## 5. Testar antes de virar (~5 min)

No **Registro.br** → seu domínio → **DNS → Editar zona**, adicione um registro **A** com nome
`teste` e valor = IP do servidor. Em alguns minutos, abra **https://teste.dominio-politico.com.br**
e entre na sua conta.

## 6. Virar o domínio (~2 min)

Ainda na zona do Registro.br:

- Apague os dois registros **A** do domínio principal que apontam para a Vercel
  (`64.29.17.1` e `216.198.79.1`) e crie um **A** com o IP do servidor.
- Troque o **CNAME** do `www` (`c6c8c6b8be01d89a.vercel-dns-017.com`) por `dominio-politico.com.br`.
- **Não mexa nos registros TXT** (verificação do Google).

Em minutos (no máximo algumas horas) o site abre pelo servidor novo, com HTTPS automático.

## No dia a dia

| Para | Comando no servidor |
| --- | --- |
| Ver se o jogo está no ar | `systemctl status dominio-politico` |
| Ver erros do jogo | `journalctl -u dominio-politico -n 100` |
| Ver a última publicação | `journalctl -u dominio-politico-atualizar -n 50` |
| Publicar na hora | `sudo dominio-politico-atualizar` |
| Mudar a configuração | `sudo nano /etc/dominio-politico.env` e depois `sudo systemctl restart dominio-politico` |
