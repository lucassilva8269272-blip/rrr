# Diorama 3D Retangular: Zoom Contínuo Macro-Micro, Navegação WSAD & Terreno Natural

Implementação de uma maquete/diorama 3D retangular interativa inspirada na estética das imagens de referência, com sistema de zoom contínuo que adapta a percepção de escala dinamicamente (quanto mais próximo da superfície, mais imersivo e detalhado em escala micro o terreno se torna), preservando todas as ferramentas de escultura e pintura (subir, abaixar, nivelar, pintar), com navegação WSAD no modo editor e correção da tonalidade inicial do mapa.

### User Review & Critical Decisions

> [!IMPORTANT]
> O usuário especificou que **não precisa ser o mapa temático da Terra-Média**, mas sim a **mecânica do mapa retangular em diorama** onde, ao dar zoom contínuo, a câmera desce e o relevo se expande em escala micro (como uma maquete viva), mantendo todas as ferramentas de edição (subir, abaixar, etc.) e a movimentação por WSAD.

- **Decisão Revisada 1 (Formato Diorama Retangular)**: O terreno será apresentado como uma maquete 3D retangular elegante (com bordas sólidas extrudadas nas laterais e base estilizada em ardósia/madeira escura, idêntico às imagens 1 e 4), permitindo escultura e pintura completas em toda a sua extensão.
- **Decisão Revisada 2 (Zoom Contínuo Dinâmico Macro ↔ Micro)**:
  - Na visão aérea (distante): o diorama se comporta como um mapa de maquete de mesa com visão ampla e visão tática.
  - Ao aproximar com o scroll do mouse ou botão de aproximação: a câmera desce sem barreiras artificiais de distância mínima (`minDistance` reduzido para quase o solo `0.1`), ajustando o plano de corte (`camera.near`) automaticamente para não atravessar o terreno.
  - O shader ativa dinamicamente microdetalhes progressivos (grão de solo, lâminas de grama, pedregulhos e micro-ondulações) conforme a câmera se aproxima, fazendo as colinas parecerem montanhas colossais sob a ótica micro.
- **Decisão Confirmada 3 (Movimentação WSAD no Editor)**:
  - Navegação suave e contínua com as teclas `W`, `S`, `A`, `D` e setas direcionais.
  - Velocidade de voo/pan proporcional à altura da câmera: quando distante, desloca-se rapidamente pela maquete; quando em zoom micro, move-se com precisão milimétrica.
  - Tecla `Shift` para boost de velocidade e proteção para não interferir em campos de digitação (`input`/`textarea`).
- **Decisão Confirmada 4 (Correção da Cor Branca Inicial)**:
  - Substituição da base cinza-clara/esbranquiçada por um verdejante natural orgânico multicamada (`#2e5738` / `#386641`) com nuances de terra fértil.
  - Desativação completa da névoa de escala no modo editor (`uFogEnabled = 0`), garantindo 100% de nitidez cristalina desde o primeiro frame.
  - Fundo do viewport refinado para ardósia escuro cinematográfico (`#14171d`).

---

### 1. Overview & Core Concept

- **O Que Faz**: Transforma o viewport em uma maquete diorama 3D retangular de alta fidelidade visual. O usuário pode esculpir livremente (subir, descer, suavizar, nivelar) e pintar com qualquer textura ou cor, podendo a qualquer instante dar zoom contínuo até o nível microscópico do solo, onde pequenos montes se transformam em vales imersivos.
- **Público & Contexto**: Criadores de cenários, mapas de RPG, arquitetos virtuais e modeladores que buscam uma sensação física e tátil de "maquete viva" com transição fluida entre visão geral e close-up extremo.
- **Valor Principal**: Experiência contínua sem quebras de modo — você não precisa trocar de tela para ver seu mapa de perto; basta aproximar a câmera para que ele cresça diante dos seus olhos em escala micro.

---

### 2. User Experience & Visual Design

- **Fluxo do Usuário**:
  1. **Abertura Imediata**: O diorama retangular surge instantaneamente sobre um fundo escuro elegante, com grama verdejante e solo natural rico (zero tela branca ou névoa invasiva).
  2. **Escultura e Pintura Fluidas**: As ferramentas (elevar, rebaixar, aplainar, pintar texturas) funcionam normalmente sobre o relevo, com resposta imediata e pincel contínuo em 60fps.
  3. **Aproximação Contínua (Zoom Micro)**:
     - Girando o scroll do mouse ou usando teclas de aproximação, a câmera mergulha sobre o ponto desejado.
     - O plano de corte da câmera recalcula dinamicamente para permitir visão a apenas 10cm do solo virtual.
     - As texturas ativam microdetalhes dinâmicos de alta frequência, fazendo com que uma colina esculpida de 15 metros pareça uma cordilheira real em escala humana/micro.
  4. **Navegação com WSAD**: Em qualquer momento, o usuário usa `W`, `S`, `A`, `D` para planar pelo mapa na altitude atual, explorando os relevos como em um jogo ou simulador.

- **Visual do Diorama Retangular**:
  - *Proporção*: Retângulo harmonioso (16:9 ou 4:3), com bordas laterais sólidas e biseladas que dão a sensação de uma tábua de relevo ou maquete de museu.
  - *Iluminação*: Iluminação suave com luz solar direcional e sombra suave, além de brilho especular nas áreas com água.
  - *Controles Intuitivos*: Indicador visual discreto de altitude da câmera e atalhos rápidos de zoom ("Visão Geral", "Zoom Médio", "Nível do Solo / Micro").

---

### 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Diorama com Saias Laterais (Base Retangular Extrudada)**
  - *Abordagem*: Adicionar uma malha lateral estilizada (skirt/base) que desce das bordas do terreno até uma base plana escura.
  - *Por que*: Transforma a malha aberta de polígonos em um bloco sólido esteticamente atraente, idêntico aos mapas de relevo de mesa exibidos nas imagens de referência.
- **Decisão 2: Zoom Contínuo com Near-Plane Dinâmico e MinDistance Adaptativo**
  - *Abordagem*: No `OrbitControls`, definir `minDistance = 0.2`, e no loop de frame, ajustar `camera.near = Math.max(0.01, dist * 0.01)` para impedir corte de geometria ("clipping") quando a câmera estiver muito próxima.
  - *Por que*: Permite que o usuário encoste a câmera na grama e nas pedras sem atravessar a malha e sem travar a rotação.
- **Decisão 3: Shader com Micro-Frequência Adaptativa à Distância da Câmera**
  - *Abordagem*: No `TerrainShader`, calcular dinamicamente a contribuição da textura micro baseada na distância real da câmera aos fragmentos (`length(cameraPosition - vWorldPosition)`), mesmo no modo editor regular.
  - *Por que*: Garante que, ao aproximar o zoom, o mapa não fique com texturas borradas ou esticadas; pelo contrário, quanto mais perto você chega, mais nítido e rico em granulação o terreno fica.
- **Decisão 4: Velocidade WSAD Escalada por Altura do Alvo**
  - *Abordagem*: A velocidade do WSAD é calculada por `speed = Math.max(8, distance * 0.9) * delta` (e 2.5x com Shift).
  - *Por que*: Garante controle cirúrgico quando você está rente ao solo (micro) e agilidade quando está vendo o mapa inteiro (macro).

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                               App.tsx                                  │
│  - Dimensões do Diorama Retangular (Largura x Profundidade)            │
│  - Inicialização Verde Natural Imediata (sem flash branco)             │
│  - Ferramentas de Escultura e Pintura Preservadas                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        components/Editor3D.tsx                         │
│  ┌───────────────────────┐  ┌───────────────────────────────────────┐  │
│  │     TerrainSystem     │  │              RTSControls              │  │
│  │ - Terreno Retangular  │  │ - Pan & Voo Contínuo com WSAD / Setas │  │
│  │ - Base / Saia Sólida  │  │ - MinDistance Dinâmico (Zoom Livre)   │  │
│  │ - Micro-Shader Ativo  │  │ - Near-Plane Adaptativo Anti-Clipping │  │
│  │ - Cor Verdejante Rica │  │ - Shift Boost & Proteção de Inputs    │  │
│  └───────────────────────┘  └───────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                 HUD de Escala & Câmera Dinâmica                  │  │
│  │ - Atalhos rápidos: Visão Aérea (Macro) ↔ Nível do Solo (Micro)   │  │
│  │ - Dica de navegação WSAD discreta                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

- **Mapeamento de Eventos e Teclas WSAD**:
  - `W`: Desloca a câmera e o foco para frente no plano do chão.
  - `S`: Desloca para trás.
  - `A`: Desloca para a esquerda.
  - `D`: Desloca para a direita.
  - `Shift`: Acelera a movimentação em 2.5x.
  - Bloqueio automático caso o usuário esteja digitando em qualquer campo de texto.
- **Ajustes de Renderização e Estética Inicial**:
  - `initMasterData`: inicialização com valores calibrados de clorofila e solo fértil (`R: 0.28, G: 0.48, B: 0.25`).
  - `uFogEnabled`: mantido em `0.0` no modo editor para eliminar a névoa esbranquiçada que causava o aspecto leitoso/branco.
  - `Canvas Background`: definido como `#15181e` com luz ambiente natural.
