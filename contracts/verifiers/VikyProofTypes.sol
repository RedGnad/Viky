// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Reclaim} from "@reclaimprotocol/solidity-sdk/contracts/Reclaim.sol";

/// @notice ABI types shared by the gift escrow and the two immutable direct-proof verifiers.
/// @dev Ported from Lock-in's LockInProofTypes: `pactId` became `giftId`, `dayIndex` grew to uint16 so a gift
///      can last up to 90 days (the verifiers cap it at 366).
library VikyProofTypes {
    struct DirectProofBundle {
        string sessionId;
        Reclaim.Proof[] proofs;
    }

    struct DuolingoEvidence {
        bytes32 identityHash;
        bytes32 proofSetHash;
        uint64 totalXp;
        uint32 proofTimestamp;
    }

    struct StravaPolicy {
        address account;
        uint256 giftId;
        uint16 dayIndex;
        string expectedSessionId;
        uint64 startsAt;
        uint64 endsAt;
        uint64 minDistanceMeters;
    }

    struct StravaEvidence {
        bytes32 identityHash;
        bytes32 nullifier;
        bytes32 proofSetHash;
        uint64 distanceMeters;
        uint64 startTime;
        uint64 movingTimeSeconds;
        uint64 elapsedTimeSeconds;
        uint64 elevationGainMeters;
        uint32 oldestProofTimestamp;
        uint32 newestProofTimestamp;
    }
}

interface IVikyDuolingoVerifier {
    function LIVE_SCHEMA_CONFIRMED() external view returns (bool);

    function validateDuolingoProofs(
        Reclaim.Proof[] calldata proofs,
        address account,
        uint256 giftId,
        bool baseline,
        uint16 dayIndex,
        string calldata expectedSessionId
    ) external view returns (VikyProofTypes.DuolingoEvidence memory evidence);
}

interface IVikyStravaVerifier {
    function LIVE_SCHEMA_CONFIRMED() external view returns (bool);

    function validateStravaProofs(Reclaim.Proof[] calldata proofs, VikyProofTypes.StravaPolicy calldata policy)
        external
        view
        returns (VikyProofTypes.StravaEvidence memory evidence);
}
