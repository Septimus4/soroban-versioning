//! Security-focused tests for production readiness

use super::test_utils::{create_test_data, init_contract};
use crate::{
    errors::ContractErrors,
    types::{AdminsConfig, Badge, PublicVote, Vote, VoteChoice},
};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, String, Bytes, BytesN, Error};

/// Test that upgrade proposals require valid threshold configurations
#[test]
fn test_upgrade_invalid_threshold() {
    let setup = create_test_data();
    let _id = init_contract(&setup);

    // Test zero threshold - should fail
    let invalid_config = AdminsConfig {
        threshold: 0,
        admins: vec![&setup.env, setup.contract_admin.clone()],
    };

    let wasm_bytes = Bytes::from_slice(&setup.env, "new_wasm".as_bytes());
    let new_wasm_hash: BytesN<32> = setup.env.crypto().keccak256(&wasm_bytes).into();
    
    // This should panic due to invalid threshold
    let result = setup.contract.try_propose_upgrade(
        &setup.contract_admin,
        &new_wasm_hash,
        &Some(invalid_config)
    );
    
    assert_eq!(result, Err(Ok(Error::from_contract_error(ContractErrors::UpgradeError as u32))));
}

/// Test that upgrade proposals require threshold <= admin count
#[test]
fn test_upgrade_threshold_exceeds_admins() {
    let setup = create_test_data();
    let _id = init_contract(&setup);

    // Test threshold > admin count - should fail
    let invalid_config = AdminsConfig {
        threshold: 3, // More than the single admin
        admins: vec![&setup.env, setup.contract_admin.clone()],
    };

    let wasm_bytes = Bytes::from_slice(&setup.env, "new_wasm".as_bytes());
    let new_wasm_hash: BytesN<32> = setup.env.crypto().keccak256(&wasm_bytes).into();
    
    // This should panic due to threshold exceeding admin count
    let result = setup.contract.try_propose_upgrade(
        &setup.contract_admin,
        &new_wasm_hash,
        &Some(invalid_config)
    );
    
    assert_eq!(result, Err(Ok(Error::from_contract_error(ContractErrors::UpgradeError as u32))));
}

/// Test that non-maintainers cannot execute proposals
#[test]
fn test_unauthorized_proposal_execution() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // Create a proposal as a maintainer
    let title = String::from_str(&setup.env, "Test Proposal");
    let ipfs = String::from_str(&setup.env, "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i");
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu, &id, &title, &ipfs, &voting_ends_at, &true
    );

    // Wait for voting to end
    setup.env.ledger().set_timestamp(voting_ends_at + 1);

    // Try to execute as non-maintainer (create a random address)
    let non_maintainer = soroban_sdk::Address::generate(&setup.env);
    
    let result = setup.contract.try_execute(
        &non_maintainer, &id, &proposal_id, &None, &None
    );
    
    // Should fail because non-maintainer cannot execute
    assert_eq!(result, Err(Ok(Error::from_contract_error(ContractErrors::UnauthorizedSigner as u32))));
}

/// Test anonymous vote commitment validation 
#[test]
fn test_anonymous_vote_commitment_validation() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // Setup anonymous voting first
    setup.contract.anonymous_voting_setup(
        &setup.grogu,
        &id,
        &String::from_str(&setup.env, "test_public_key")
    );

    // Test mismatched votes and seeds length
    let result = setup.contract.try_build_commitments_from_votes(
        &id,
        &vec![&setup.env, 1u128, 2u128], // 2 votes
        &vec![&setup.env, 1u128] // 1 seed - mismatch!
    );
    
    assert_eq!(result, Err(Ok(Error::from_contract_error(ContractErrors::TallySeedError as u32))));
}

/// Test voting weight validation enforces member limits
#[test]
fn test_voting_weight_enforcement() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // Add a member with limited badges
    setup.contract.add_member(&setup.mando, &String::from_str(&setup.env, "test"));
    setup.contract.set_badges(
        &setup.grogu, &id, &setup.mando, 
        &vec![&setup.env, Badge::Community] // Only 1M weight
    );

    // Create a proposal
    let title = String::from_str(&setup.env, "Test Proposal");
    let ipfs = String::from_str(&setup.env, "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i");
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu, &id, &title, &ipfs, &voting_ends_at, &true
    );

    // Try to vote with weight exceeding their max (should fail)
    let excessive_vote = Vote::PublicVote(PublicVote {
        address: setup.mando.clone(),
        weight: 10_000_000, // More than Community badge allows (1M)
        vote_choice: VoteChoice::Approve,
    });

    let result = setup.contract.try_vote(&setup.mando, &id, &proposal_id, &excessive_vote);
    assert_eq!(result, Err(Ok(Error::from_contract_error(ContractErrors::VoterWeight as u32))));
}

/// Test that proposal creation respects pagination limits  
#[test]
fn test_proposal_pagination_limits() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // This is hard to test without creating 9000+ proposals
    // But we can at least verify the check exists by looking at a large proposal ID
    let large_page = 1001; // Exceeds MAX_PAGES (1000)
    let result = setup.contract.try_get_dao(&id, &large_page);
    
    assert_eq!(result, Err(Ok(Error::from_contract_error(ContractErrors::NoProposalorPageFound as u32))));
}

/// Test that voting is prevented after the voting deadline
#[test]
fn test_voting_after_deadline() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // Add a member with voting rights
    setup.contract.add_member(&setup.mando, &String::from_str(&setup.env, "test"));
    setup.contract.set_badges(
        &setup.grogu, &id, &setup.mando, 
        &vec![&setup.env, Badge::Community]
    );

    // Create a proposal
    let title = String::from_str(&setup.env, "Test Proposal");
    let ipfs = String::from_str(&setup.env, "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i");
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu, &id, &title, &ipfs, &voting_ends_at, &true
    );

    // Fast forward past the voting deadline
    setup.env.ledger().set_timestamp(voting_ends_at + 1);

    // Try to vote after deadline - should fail
    let late_vote = Vote::PublicVote(PublicVote {
        address: setup.mando.clone(),
        weight: 1_000_000, // Community badge weight
        vote_choice: VoteChoice::Approve,
    });

    let result = setup.contract.try_vote(&setup.mando, &id, &proposal_id, &late_vote);
    assert_eq!(result, Err(Ok(Error::from_contract_error(ContractErrors::ProposalVotingTime as u32))));
}