use super::test_utils::{create_test_data, init_contract};
use crate::types::{PublicVote, Vote, VoteChoice, ProposalStatus};
use soroban_sdk::testutils::{arbitrary::std::println, Ledger};
use soroban_sdk::String;

#[test]
fn proposal_flow() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let title = String::from_str(&setup.env, "Integrate with xlm.sh");
    let ipfs = String::from_str(&setup.env, "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i");
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    let proposal_id = setup.contract.create_proposal(&setup.grogu, &id, &title, &ipfs, &voting_ends_at, &true);

    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    setup.env.ledger().set_timestamp(voting_ends_at + 1);
    let result = setup.contract.execute(&setup.mando, &id, &proposal_id, &None, &None);

    assert_eq!(result, ProposalStatus::Cancelled);

    let cost = setup.env.cost_estimate().budget();
    println!("{:#?}", cost);
}
