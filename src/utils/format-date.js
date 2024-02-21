'use strict'

const dateComponentPad = (newValue) => {
  const format = String(newValue);

  return format.length < 2 ? `0${format}` : format;
};

const formatDate = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(dateComponentPad)

module.exports = formatDate