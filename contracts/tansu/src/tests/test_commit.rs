use super::test_utils::{create_test_data, init_contract};
use soroban_sdk::testutils::arbitrary::std::println;
use soroban_sdk::String;

#[test]
fn commit_flow() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    setup.contract.commit(&setup.mando, &id, &hash);

    let stored = setup.contract.get_commit(&id);
    assert_eq!(stored, hash);

    let cost = setup.env.cost_estimate().budget();
    println!("{:#?}", cost);
}
