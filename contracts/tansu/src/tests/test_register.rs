use super::test_utils::{create_test_data, init_contract};
use soroban_sdk::testutils::arbitrary::std::println;
use soroban_sdk::String;

#[test]
fn register_project() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let project = setup.contract.get_project(&id);
    assert_eq!(project.name, String::from_str(&setup.env, "tansu"));

    let cost = setup.env.cost_estimate().budget();
    println!("{:#?}", cost);
}
