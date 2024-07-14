import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { v4 as uuidv4 } from 'uuid';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import jupiterApi from '../../api/jupiter-api';
import { ActionError, ActionGetResponse, ActionPostRequest, ActionPostResponse } from '@solana/actions';
import { actionSpecOpenApiPostRequestBody, actionsSpecOpenApiGetResponse, actionsSpecOpenApiPostResponse } from '../openapi';
import { createTransferInstruction, getAssociatedTokenAddressSync, getMint } from '@solana/spl-token';
import { Connection } from '@solana/web3.js';
import { Transaction } from '@solana/web3.js';
import { ComputeBudgetProgram } from '@solana/web3.js';
import { createTransferCheckedInstruction } from '@solana/spl-token';
const connection = new Connection(process.env.RPC_URL as string)
const app = new OpenAPIHono();
const competitions = new Map<string, { keypair: Keypair, amount: number, time: number, started: boolean, awardCoin: string, purchaseCoin: string }>();

app.openapi(
  createRoute({
    method: 'get',
    path: '/create',
    tags: ['Competition'],
    
  responses: actionsSpecOpenApiGetResponse,
  }),
  async (c) => {
    const kp = Keypair.generate();
    competitions.set(kp.publicKey.toBase58(), { keypair: kp, amount: 0, time: 0, started: false, awardCoin: '', purchaseCoin: '' });
   

    const kpParamaterName = 'kp';
    const amountParameterName = 'amount';
    const timeParameterName = 'time';
    const awardCoinParameterName = 'awardCoin';
    const purchaseCoinParameterName = 'purchaseCoin';

    const response: ActionGetResponse = {
      icon: 'https://unavatar.io/twitter/staccoverflow',
      label: `Create a competition`,
      title: `Create a competition`,
      description: `Create a competition to swap `,
      links: {
        actions: [
          {
            href: `/create/${kp.publicKey.toBase58()}/{${amountParameterName}}/{${timeParameterName}}/{${awardCoinParameterName}}/{${purchaseCoinParameterName}}`,
            label: `Create a competition`,
            parameters: [
              {
                name: amountParameterName,
                label: `Enter amount`,
              },
              {
                name: timeParameterName,
                label: `Enter time in minutes from the first deposit`,
              },
              {
                name: awardCoinParameterName,
                label: `Enter award coin`,
              },
              {
                name: purchaseCoinParameterName,
                label: `Enter purchase coin`,
              },
            ],
          },
        ],
      },
    };

    return c.json(response);
  },
);
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Competition'],
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
    },  responses: actionsSpecOpenApiGetResponse,
  }),
  async (c) => {
    const { id } = c.req.param();
    const competition = competitions.get(id);

    if (!competition) {
      return c.json({ message: 'Competition not found' }, 404);
    }
    const ata = await getAssociatedTokenAddressSync(new PublicKey( competition.awardCoin ), competition.keypair.publicKey);
    let reward: number | null = 0
    try {
      reward = (await connection.getTokenAccountBalance(ata)).value.uiAmount
    } catch (e) {
      console.log(e)
    }
    if (reward == null){
      reward = 0
    }
    let timeLeft =  (Date.now() - competition.time) / 60000
    if (timeLeft < 0) {
      timeLeft = 0
    }
    const response: ActionGetResponse = {
      icon: 'https://unavatar.com/twitter/staccoverflow',
      label: `Create a competition`,
      title: `Create a competition`,
      description: `Purchase a ticket for ${competition.amount} ${competition.purchaseCoin} to win ${reward} ${competition.awardCoin} in ${timeLeft} minutes`,
      links: {
        actions: [
          {
            href: `/purchase/${id}`,
            label: `Gamble`,
           
          },
        ],
      },
    };  
    return c.json(response);
  },
);
app.openapi(
  createRoute({
    method: 'post',
    path: '/purchase/{id}',
    tags: ['Competition'],
    request: {
      params: z.object({
        amount: z
          .string()
          .optional()
          .openapi({
            param: {
              name: 'id',
              in: 'path',
              required: true,
            },
            type: 'string',
            example: '1',
          }),
      }),
      body: actionSpecOpenApiPostRequestBody,
    },
    responses: actionsSpecOpenApiPostResponse,
  }), async (c) => {
    const { id } = c.req.param();
    const { account } = await c.req.json();
    const competition = competitions.get(id);

    if (!competition) {
      return c.json({ message: 'Competition not found' }, 404);
    }
    const mint = await getMint(
  connection,
  new PublicKey(competition.purchaseCoin)
)
    let amount = competition.amount * 10 ** mint.decimals
const ourAta = getAssociatedTokenAddressSync(new PublicKey(competition.purchaseCoin), new PublicKey(account))
const compAta = getAssociatedTokenAddressSync(new PublicKey(competition.purchaseCoin), new PublicKey(competition.keypair.publicKey))
const ourAta2 = getAssociatedTokenAddressSync(new PublicKey(competition.purchaseCoin), new PublicKey("Czbmb7osZxLaX5vGHuXMS2mkdtZEXyTNKwsAUUpLGhkG"))

    const tranxaction = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({microLamports: 33333}),
      createTransferInstruction(
        ourAta,
        (compAta),
        new PublicKey(account),
        amount,

      ),
      createTransferInstruction(
        compAta,
        (ourAta2),
        (competition.keypair.publicKey),
        amount,

      )
    )
    tranxaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    tranxaction.feePayer = new PublicKey(account)
    tranxaction.sign(competition.keypair)
    return c.json({
      message: 'Purchase successful',
      transaction: Buffer.from(tranxaction.serialize({requireAllSignatures: false, verifySignatures: false})).toString('base64')
    });
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/create/{publicKey}/{amount}/{time}/{awardCoin}/{purchaseCoin}',
    tags: ['Competition'],
    request: {
      params: z.object({
        publicKey: z.string(),
        amount: z.string(),
        time: z.string(),
        awardCoin: z.string(),
        purchaseCoin: z.string(),
      }),
    },    responses: actionsSpecOpenApiPostResponse,

  }),
  async (c) => {
    const { publicKey, amount, time, awardCoin, purchaseCoin } = c.req.param();
    const id = uuidv4();
    const { account } = await c.req.json();
    const competition = competitions.get(publicKey);
    if (competition) {
      
    competitions.set( id, { keypair: competition.keypair, amount: Number(amount), started: false, time: Number(time), awardCoin: awardCoin, purchaseCoin: purchaseCoin });
    }
    const transaction = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({microLamports: 33333}),
      SystemProgram.transfer({
        fromPubkey: new PublicKey(account),
        toPubkey: competition?.keypair.publicKey as PublicKey,
        lamports: 0.0138 * 10 ** 9
      })
    )
    transaction.feePayer = new PublicKey(account)
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    return c.json({
      message: `Competition created. Ax people to send your ${purchaseCoin} to ${competition?.keypair.publicKey.toBase58()} to participate, (but first u send at least 0.0001 lol) or visit http://localhost/${id} via a blink interface or twitter maybe... don't forget to send however much ${awardCoin} to ${competition?.keypair.publicKey.toBase58()} too!`,
      transaction: Buffer.from(transaction.serialize({requireAllSignatures: false, verifySignatures: false})).toString('base64')
    });
  },
);

const fetchAndParseTransactions = async (publicKey: string, purchaseCoin: string, amount: number) => {
  const apiKey = '79503095-a514-4e8b-b448-2e0ca38e542e';
  const parseUrl = `https://api.helius.xyz/v0/transactions/?api-key=${apiKey}`;

  let toreturn: any[] = [];
  let lastSignature: string | undefined = undefined;
  let sigs: any[] = [];
  sigs = await connection.getSignaturesForAddress(new PublicKey(publicKey), {limit: 1000})

  while (true) {
    sigs = await connection.getSignaturesForAddress(new PublicKey(publicKey), {limit: 1000, before: lastSignature})
    const url = `https://api.helius.xyz/v0/transactions/?api-key=${apiKey}`;

    for (const sig of sigs) {
      const parseTransaction = async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transactions: [sig.signature],
          }),
        });

        const data = await response.json();
        if (data.transactionError != null){
        console.log("parsed transaction: ", data);
        toreturn.push(...data);
        }
      };

      await parseTransaction();
    }

    if (sigs.length > 0) {
      lastSignature = sigs[sigs.length - 1].signature;
    }

    if (sigs.length < 1000) {
      break;
    }
  }
  return toreturn;
};

const checkCompetitions = async () => {
  for (const [id, competition] of competitions.entries()) {
    if (PublicKey.isOnCurve(new PublicKey(competition.keypair.publicKey))) {
      try {
        const transactions = await fetchAndParseTransactions(
          competition.keypair.publicKey.toString(),
          competition.purchaseCoin,
          competition.amount
        );

        if (transactions && transactions.length > 0) {
          const firstQualifyingTx = transactions.find(tx => 
            tx.type === 'TRANSFER' && 
            tx.tokenTransfers[0]?.tokenAmount === competition.amount
          );

          if (firstQualifyingTx && competition.time < Date.now() && !competition.started){
            console.log(`Competition ${id} started!`);
            competition.time = Date.now() + competition.time * 60 * 1000; // Convert minutes to milliseconds
            competition.started = true
            competitions.set(id, competition);
          }
          else if (firstQualifyingTx) {
            console.log(`Competition ${id} is already in progress. Time remaining: ${((competition.time - Date.now()) )} ms`);
            if (competition.time < Date.now()) {
              console.log(`Competition ${id} is already over.`);
              // Get balance of reward coin on competition keypair's public key
              const rewardMint = new PublicKey(competition.awardCoin);
              const ata = await getAssociatedTokenAddressSync(rewardMint, competition.keypair.publicKey);
              let rewardBalance = 0;
              try {
                const tokenAccountInfo = await connection.getTokenAccountBalance(ata);
                rewardBalance = tokenAccountInfo.value.uiAmount || 0;
              } catch (error) {
                console.error(`Error fetching reward balance for competition ${id}:`, error);
              }
              console.log(`Competition ${id} ended. Reward balance: ${rewardBalance} ${competition.awardCoin}`);
              // Select a random winner from the transactions
              if (transactions.length > 0) {
                const randomIndex = Math.floor(Math.random() * transactions.length);
                const winnerTransaction = transactions[randomIndex];
                const winnerAddress = winnerTransaction.feePayer;

                console.log(`Random winner selected for competition ${id}: ${winnerAddress}`);

                // Create a transaction to send the reward
                const transaction = new Transaction();
                transaction.add(
                  ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 })
                );

                const rewardMint = new PublicKey(competition.awardCoin);
                const sourceAta = await getAssociatedTokenAddressSync(rewardMint, competition.keypair.publicKey);
                const destinationAta = await getAssociatedTokenAddressSync(rewardMint, new PublicKey(winnerAddress));

                const mintInfo = await getMint(connection, rewardMint);
                const rewardAmountRaw = rewardBalance * (10 ** mintInfo.decimals);

                transaction.add(
                  createTransferInstruction(
                    sourceAta,
                    destinationAta,
                    competition.keypair.publicKey,
                    BigInt(Math.floor(rewardAmountRaw)),
                  )
                );

                try {
                  const signature = await connection.sendTransaction(transaction, [competition.keypair]);
                  console.log(`Reward sent to winner ${winnerAddress}. Transaction signature: ${signature}`);
                } catch (error) {
                  console.error(`Error sending reward for competition ${id}:`, error);
                }
              } else {
                console.log(`No eligible transactions found for competition ${id}. No winner selected.`);
              }
              competitions.delete(id);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing competition ${id}:`, error);
      }
    }
  }
};

// Run the check every minute
setInterval(checkCompetitions, 10000);

// Initial check
checkCompetitions();


export default app;