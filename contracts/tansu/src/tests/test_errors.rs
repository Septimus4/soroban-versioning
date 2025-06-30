use super::test_utils::{create_test_data, init_contract};
use crate::{contract_versioning::domain_register, errors::ContractErrors};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Bytes, String, vec};

#[test]
fn registration_and_commit_errors() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let name = String::from_str(&setup.env, "tansu");
    let url = String::from_str(&setup.env, "github.com/file.toml");
    let hash = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    // double registration
    let err = setup
        .contract
        .try_register(&setup.grogu, &name, &maintainers, &url, &hash, &setup.domain_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProjectAlreadyExist.into());

    // name too long
    let name_long = String::from_str(&setup.env, "soroban-versioningsoroban-versioningsoroban-versioningsoroban-versioning");
    let err = setup
        .contract
        .try_register(&setup.grogu, &name_long, &maintainers, &url, &hash, &setup.domain_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidDomainError.into());

    // unregistered maintainer commit
    let bob = Address::generate(&setup.env);
    let hash_commit = String::from_str(&setup.env, "deadbeef");
    let err = setup
        .contract
        .try_commit(&bob, &id, &hash_commit)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::UnregisteredMaintainer.into());

    // maintainer not domain owner
    let name_b = Bytes::from_slice(&setup.env, b"bob");
    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.mando, &genesis_amount);
    domain_register(&setup.env, &name_b, &setup.mando, setup.domain_id.clone());
    let name_b_str = String::from_str(&setup.env, "bob");
    let err = setup
        .contract
        .try_register(&setup.grogu, &name_b_str, &maintainers, &url, &hash, &setup.domain_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::MaintainerNotDomainOwner.into());
}
