# Indexer

The contracts' events are indexed with Envio HyperIndex in a separate repository,
[RedGnad/Viky-index](https://github.com/RedGnad/Viky-index): `config.yaml` names the contracts of [Contracts](CONTRACTS.md), all but the converter, and the
events read from each, `schema.graphql` the entities (every gift, check-in, drained day, payout and refund, and the
aggregates per day, per condition and in all). It answers GraphQL at
an endpoint that changes with each hosted deployment: that repository's README gives the one in service. The
deployment in service was made before the third daily contract and does not read it yet. The app reads
it in one place, the judges page (who has used Viky, and the index set beside the chain); no movement of money depends
on it, and every figure a funder or a recipient sees comes from the contracts themselves.
