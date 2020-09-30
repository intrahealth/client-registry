const { defineFeature, loadFeature } = require( "jest-cucumber" )

const feature = loadFeature("../features/addPatient.feature")

defineFeature( feature, test => {
  test("Add a new Patient", ({ given, when, then }) => {
    given("A new Patient", newPatient => {
      let patient = JSON.parse(newPatient)
    } )
    when("The POS sends the Patient", () => {
    } )
    then("The added Patient Location and CRID are returned", () => {
      expect(true).toBeTruthy()
    } )
  } )
} )

