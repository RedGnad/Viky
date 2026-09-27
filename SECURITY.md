# Security

Viky moves real money on Monad mainnet: the gift contracts hold AUSD in people's names, and the app relays their
signed actions. A vulnerability is taken seriously and answered first.

## Reporting a vulnerability

Report it privately through GitHub: the **Security** tab of this repository, then **Report a vulnerability**. Please do
not open a public issue, and do not test against gifts or accounts that are not yours.

Useful in a report: what can be done and by whom, the contract function or the route involved, and the steps or the
transaction that show it. Contract addresses and owners are listed on [viky.cash/judges](https://viky.cash/judges).

## Scope

- the contracts in `contracts/` as deployed on Monad mainnet;
- the application served at viky.cash and its API routes under `app/api/`;
- the attested-fetch worker in `scripts/zkfetch-worker.ts`.

There is no bug bounty.
