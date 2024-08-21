'use strict';

const axios = require("axios");
const config = require("../../config");

const eraPaidEventsQuery = `
query EraPaidEvents {
  events(
    orderBy: BLOCK_NUMBER_DESC,
    first: 28,
    filter: {
      method: { equalTo: "EraPaid" },
      section: { equalTo: "staking" }
    }
  ) {
    nodes {
      data
    }
  }
}
`;

const getApi = () => axios.create({
  baseURL: config.EXPLORER_API_URL,
});


const getLastWeekEraPaidEvents = async () => {
  const { data } = await getApi().post('', {
    query: eraPaidEventsQuery
  });
  return data.data.events.nodes.map(v => v.data);
};

module.exports = {
  getLastWeekEraPaidEvents,
}