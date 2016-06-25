/*
 * Copyright 2016 Esri
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dijit/_WidgetBase",
  "dijit/_TemplatedMixin",
  "esri/opsdashboard/MapToolConfigurationProxy",
  "dojo/text!./socialMediaMapToolConfigTemplate.html",
  "dijit/form/TextBox",
  "dijit/form/NumberTextBox",
  "dijit/form/Select",
  "dojo/number"
], function (declare, lang, _WidgetBase, _TemplatedMixin, MapToolConfigurationProxy, templateString, TextBox, NumberTextBox, Select, number) {

  return declare("SocialMediaMapToolConfig", [_WidgetBase, _TemplatedMixin, MapToolConfigurationProxy], {
    templateString: templateString,

    // Provide a configuration UI to capture the following
    // -date

    postCreate: function () {
      var defaultTags = "";
      var defaultRadius = 5;
      var defaultDate = 7;

      this.tagsField.value = defaultTags;
      this.radiusField.value = defaultRadius;
      this.radiusUnitField.selectedIndex = 0;
      this.dateField.value = defaultDate;
      this.dateUnitField.selectedIndex = 0;

      // if this.config has no properties, populate UI and config with the default value
      // otherwise, populate UI with properties from config
      this.config = {
        "tags": defaultTags,
        "takenDate": {
          "value": defaultDate,
          "unit": this.radiusUnitField.options[0].value
        },
        "radius": {
          "value": defaultRadius,
          "unit": this.dateUnitField.options[0].value
        }
      };

      this.inherited(arguments);
    },

    tagsFieldChanged: function () {
      if (this.tagsField.value === "") {
        console.log("tagsField is empty");
        this.readyToPersistConfig(false);
      }
      else {
        console.log("tagsField is " + this.tagsField.value);
        this.config.tags = this.tagsField.value;
        this.readyToPersistConfig(true);
      }
    },

    radiusInputChanged: function () {
      var radius = number.parse(this.radiusField.value);
      var radiusUnit = this.radiusUnitField.value;

      if (radius && radius > 0 && ((radiusUnit == "km" && radius < 32) || (radiusUnit == "mi" && radius < 20 ))) {
        this.config.radius = {
          "value": radius,
          "unit": radiusUnit
        };
        console.log("radius " + this.config.radius.value + " " + this.config.radius.unit);
        this.readyToPersistConfig(true);
      }
      else
        this.readyToPersistConfig(false);
    },

    dateFieldChanged: function () {
      var date = number.parse(this.dateField.value)
      if (!date || date <= 0)
        this.readyToPersistConfig(false);
      else {
        this.config.takenDate = {
          "value": date,
          "unit": this.dateUnitField.value
        };
        console.log("date " + this.config.date.value + " " + this.config.date.unit);
        this.readyToPersistConfig(true);
      }
    }
  });
});