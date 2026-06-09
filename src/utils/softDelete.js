/**
 * Mongoose plugin to support soft deletes.
 * Automatically adds 'isDeleted' and 'deletedAt' fields and filters them out of default queries.
 */
const softDeletePlugin = (schema) => {
  schema.add({
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    }
  });

  // Query middleware to intercept and filter out soft deleted items
  const excludeDeleted = function (next) {
    const query = this.getQuery();
    // Allow bypassing if the query explicitly checks 'isDeleted'
    if (query && query.isDeleted === undefined) {
      this.where({ isDeleted: { $ne: true } });
    }
    next();
  };

  // Register hooks for find and update methods
  schema.pre('find', excludeDeleted);
  schema.pre('findOne', excludeDeleted);
  schema.pre('findOneAndUpdate', excludeDeleted);
  schema.pre('update', excludeDeleted);
  schema.pre('updateOne', excludeDeleted);
  schema.pre('updateMany', excludeDeleted);
  schema.pre('countDocuments', excludeDeleted);

  /**
   * Soft deletes a document instance.
   * @returns {Promise<Document>} The updated document instance.
   */
  schema.methods.softDelete = async function () {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
  };

  /**
   * Restores a soft-deleted document instance.
   * @returns {Promise<Document>} The updated document instance.
   */
  schema.methods.restore = async function () {
    this.isDeleted = false;
    this.deletedAt = null;
    return this.save();
  };
};

module.exports = softDeletePlugin;
