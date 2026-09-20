// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface ICouncil {
    function getThreshold() external view returns (uint256);
    function isOwner(address owner) external view returns (bool);
}

/// @notice Public appointment record. Storage and day-to-day publishing stay on Swarm.
/// @dev No upgrade key, owner escape hatch, funds, or dependency on a Relay server.
contract RelayRegistry {
    address public immutable council;
    bytes32 public immutable catalogueId;
    address public publisher;
    bytes32 public topic;
    bytes32 public checkpoint;
    bytes32 public agreement;
    uint64 public revision;

    error CouncilOnly();
    error InsufficientThreshold();
    error InvalidAppointment();
    error StaleRevision();

    event StewardAppointed(
        uint64 indexed revision, address indexed previousPublisher, address indexed publisher,
        bytes32 topic, bytes32 checkpoint, bytes32 agreement
    );

    constructor(address council_, bytes32 catalogueId_, address publisher_, bytes32 topic_, bytes32 checkpoint_, bytes32 agreement_) {
        if (council_.code.length == 0 || catalogueId_ == bytes32(0)) revert InvalidAppointment();
        council = council_;
        catalogueId = catalogueId_;
        _validate(publisher_, topic_, checkpoint_, agreement_);
        publisher = publisher_;
        topic = topic_;
        checkpoint = checkpoint_;
        agreement = agreement_;
        emit StewardAppointed(0, address(0), publisher_, topic_, checkpoint_, agreement_);
    }

    function appoint(uint64 expectedRevision, address next, bytes32 nextTopic, bytes32 nextCheckpoint, bytes32 nextAgreement) external {
        if (msg.sender != council) revert CouncilOnly();
        if (expectedRevision != revision) revert StaleRevision();
        if (next == publisher) revert InvalidAppointment();
        _validate(next, nextTopic, nextCheckpoint, nextAgreement);
        address previous = publisher;
        publisher = next;
        topic = nextTopic;
        checkpoint = nextCheckpoint;
        agreement = nextAgreement;
        revision += 1;
        emit StewardAppointed(revision, previous, next, nextTopic, nextCheckpoint, nextAgreement);
    }

    function _validate(address next, bytes32 nextTopic, bytes32 nextCheckpoint, bytes32 nextAgreement) private view {
        if (ICouncil(council).getThreshold() < 2) revert InsufficientThreshold();
        if (next == address(0) || next == council || ICouncil(council).isOwner(next)
            || nextTopic == bytes32(0) || nextCheckpoint == bytes32(0) || nextAgreement == bytes32(0)) {
            revert InvalidAppointment();
        }
    }
}
